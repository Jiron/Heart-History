import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Directory, File, Paths } from 'expo-file-system';
import { Image } from 'react-native';
import { toByteArray } from 'base64-js';
import jpeg from 'jpeg-js';

import { recognise } from '@/ocr/pipeline';
import type { OcrOptions, OcrResult } from '@/ocr/types';

/**
 * Working resolution handed to the recogniser.
 *
 * The recogniser downscales to 1000px internally, so shrinking here first is
 * purely about decode cost: a 12-megapixel phone photo takes an order of
 * magnitude longer to turn into pixels in JavaScript than a 1-megapixel one, and
 * the extra detail is discarded immediately afterwards.
 */
const WORKING_MAX_DIM = 1100;

export interface ScanOutcome {
  result: OcrResult;
  /** The downscaled JPEG actually analysed. Useful for the review preview. */
  previewUri: string;
  previewWidth: number;
  previewHeight: number;
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

/**
 * Turns a photo into a reading, entirely on the device.
 *
 * Nothing here touches the network. The image is decoded to raw pixels in
 * JavaScript and handed to the same recogniser the test suite exercises, so
 * behaviour on the phone matches what the fixtures measure.
 */
export async function scanImage(
  uri: string,
  options: OcrOptions = {},
): Promise<ScanOutcome> {
  let targetWidth: number | undefined;
  let targetHeight: number | undefined;

  try {
    const { width, height } = await getImageSize(uri);
    if (Math.max(width, height) > WORKING_MAX_DIM) {
      // Constrain the longer side so a landscape photo is not blown up.
      if (width >= height) targetWidth = WORKING_MAX_DIM;
      else targetHeight = WORKING_MAX_DIM;
    }
  } catch {
    // Size lookup can fail for some content:// URIs. Falling back to a width
    // constraint is safe: worst case the image stays a little larger than needed.
    targetWidth = WORKING_MAX_DIM;
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

  const bytes = toByteArray(saved.base64);
  // `useTArray` keeps jpeg-js on typed arrays instead of Node Buffers, which do
  // not exist under Hermes.
  const decoded = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true });

  const result = recognise(
    { width: decoded.width, height: decoded.height, data: decoded.data },
    options,
  );

  rendered.release();

  return {
    result,
    previewUri: saved.uri,
    previewWidth: saved.width,
    previewHeight: saved.height,
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
