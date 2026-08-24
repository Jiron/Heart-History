import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Directory, File, Paths } from 'expo-file-system';
import { Image } from 'react-native';
import { toByteArray } from 'base64-js';
import jpeg from 'jpeg-js';

import { recognise } from '@/ocr/pipeline';
import type { OcrOptions, OcrResult } from '@/ocr/types';
import { readRemotely } from './remoteOcr';

/**
 * Working resolution handed to the recogniser.
 *
 * The recogniser downscales to 1000px internally, so shrinking here first is
 * purely about decode cost: a 12-megapixel phone photo takes an order of
 * magnitude longer to turn into pixels in JavaScript than a 1-megapixel one, and
 * the extra detail is discarded immediately afterwards.
 */
const WORKING_MAX_DIM = 1100;

/**
 * Slightly larger when the assisted reader is doing the work.
 *
 * The on-device recogniser downscales to 1000 internally, so anything above
 * that is wasted. The vision model resamples to 1280, so sending less than that
 * throws away detail it would have used — and on a photo where the panel is a
 * tenth of the frame, that detail is the digits.
 */
const REMOTE_MAX_DIM = 1280;

/** Which reader produced a result. Shown on the review screen. */
export type ScanReader = 'device' | 'assisted';

export interface ScanOutcome {
  result: OcrResult;
  /** The downscaled JPEG actually analysed. Useful for the review preview. */
  previewUri: string;
  previewWidth: number;
  previewHeight: number;
  reader: ScanReader;
  /**
   * Set when the assisted reader was configured but could not be reached, so
   * the device read it instead. The review screen says so rather than silently
   * giving a worse answer.
   */
  assistedError: string | null;
}

function getImageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      (error) => reject(error),
    );
  });
}

export interface ScanConfig extends OcrOptions {
  /**
   * Address of the assisted reader, or null to read on the device.
   *
   * When set, the photo goes there first and the on-device recogniser is only
   * used if it cannot be reached. See services/remoteOcr.ts.
   */
  serverUrl?: string | null;
}

/**
 * Turns a photo into a reading.
 *
 * By default nothing here touches the network: the image is decoded to raw
 * pixels in JavaScript and handed to the same recogniser the test suite
 * exercises, so behaviour on the phone matches what the fixtures measure.
 *
 * If `serverUrl` is set the photo is sent there instead, and the device
 * recogniser becomes the fallback for when it is unreachable. The two return
 * the same shape, so nothing downstream has to know which one answered.
 */
export async function scanImage(
  uri: string,
  config: ScanConfig = {},
): Promise<ScanOutcome> {
  const { serverUrl, ...options } = config;
  const useAssisted = typeof serverUrl === 'string' && serverUrl.trim().length > 0;
  const maxDim = useAssisted ? REMOTE_MAX_DIM : WORKING_MAX_DIM;

  let targetWidth: number | undefined;
  let targetHeight: number | undefined;

  try {
    const { width, height } = await getImageSize(uri);
    if (Math.max(width, height) > maxDim) {
      // Constrain the longer side so a landscape photo is not blown up.
      if (width >= height) targetWidth = maxDim;
      else targetHeight = maxDim;
    }
  } catch {
    // Size lookup can fail for some content:// URIs. Falling back to a width
    // constraint is safe: worst case the image stays a little larger than needed.
    targetWidth = maxDim;
  }

  const context = ImageManipulator.manipulate(uri);
  if (targetWidth !== undefined || targetHeight !== undefined) {
    context.resize({ width: targetWidth ?? null, height: targetHeight ?? null });
  }
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({
    format: SaveFormat.JPEG,
    compress: 0.92,
    base64: true,
  });

  if (!saved.base64) {
    throw new Error('Could not read the image data.');
  }

  let result: OcrResult | null = null;
  let reader: ScanReader = 'device';
  let assistedError: string | null = null;

  if (useAssisted) {
    try {
      result = await readRemotely(saved.base64, serverUrl as string);
      reader = 'assisted';
    } catch (error) {
      // Not fatal. The device recogniser is worse on hard photos but it is
      // always there, and a reachable-server outage should degrade rather than
      // fail outright.
      assistedError = error instanceof Error ? error.message : String(error);
    }
  }

  if (!result) {
    const bytes = toByteArray(saved.base64);
    // `useTArray` keeps jpeg-js on typed arrays instead of Node Buffers, which
    // do not exist under Hermes.
    const decoded = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true });
    result = recognise(
      { width: decoded.width, height: decoded.height, data: decoded.data },
      options,
    );
  }

  rendered.release();

  return {
    result,
    previewUri: saved.uri,
    previewWidth: saved.width,
    previewHeight: saved.height,
    reader,
    assistedError,
  };
}

const PHOTO_DIR = 'photos';

/**
 * Copies a scanned photo into app-private storage so it survives the OS clearing
 * the cache. Returns the stored URI, or null if it could not be kept.
 */
export async function persistPhoto(uri: string, id: string): Promise<string | null> {
  try {
    const dir = new Directory(Paths.document, PHOTO_DIR);
    if (!dir.exists) dir.create({ intermediates: true });

    const source = new File(uri);
    const target = new File(dir, `${id}.jpg`);
    if (target.exists) target.delete();
    source.copy(target);
    return target.uri;
  } catch {
    return null;
  }
}

/** Removes a stored photo. Missing files are not an error. */
export async function deletePhoto(uri: string | null): Promise<void> {
  if (!uri) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // A photo that cannot be deleted must not block deleting the reading.
  }
}
