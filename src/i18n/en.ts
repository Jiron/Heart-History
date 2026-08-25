import type { Dictionary } from './de';

/** English. Type-checked against the German dictionary, which is the source of truth. */
export const en: Dictionary = {
  languageName: 'English',

  common: {
    cancel: 'Cancel',
    done: 'Done',
    save: 'Save',
    saveChanges: 'Save changes',
    delete: 'Delete',
    remove: 'Remove',
    edit: 'Edit',
    add: 'Add',
    seeAll: 'See all',
    manage: 'Manage',
    retry: 'Try again',
    mmHg: 'mmHg',
    bpm: 'bpm',
    systolic: 'Systolic',
    diastolic: 'Diastolic',
    pulse: 'Pulse',
    upper: 'upper',
    lower: 'lower',
    optional: 'optional',
    average: 'Average',
    readings: 'Readings',
    readingCount: (n: number) => (n === 1 ? '1 reading' : `${n} readings`),
    dayCount: (n: number) => (n === 1 ? '1 day' : `${n} days`),
  },

  relative: {
    justNow: 'just now',
    minutes: (n: number) => `${n} min ago`,
    hours: (n: number) => `${n}h ago`,
    yesterday: 'yesterday',
    days: (n: number) => `${n} days ago`,
    months: (n: number) => (n === 1 ? '1 month ago' : `${n} months ago`),
    years: (n: number) => (n === 1 ? '1 year ago' : `${n} years ago`),
  },

  tabs: {
    today: 'Today',
    history: 'History',
    trends: 'Trends',
    settings: 'Settings',
  },

  screens: {
    review: 'Check the reading',
    entry: 'Add a reading',
    reading: 'Reading',
    editReading: 'Edit reading',
    profiles: 'People',
  },

  boot: {
    failedTitle: 'Heart History could not start',
    genericError: 'Could not load your data.',
  },

  home: {
    latestReading: 'LATEST READING',
    noReadingsTitle: 'No readings yet',
    noReadingsMessage:
      'Point the camera at your monitor and Heart History will read the numbers for you — or type them in by hand.',
    scanRunning: 'Reading the display …',
    scanReady: 'Reading ready to check',
    scanFailed: 'Could not read the display',
    scanMonitor: 'Scan monitor',
    sevenDayAverage: '7-day average',
    sevenDayNote: (days: number, count: number) =>
      `Morning and evening readings over ${days === 1 ? '1 day' : `${days} days`} (${count} ${count === 1 ? 'measurement' : 'measurements'}). This is the average home-monitoring guidance asks for.`,
    last30Days: 'Last 30 days',
    recent: 'Recent',
    trendingUp: 'Trending upwards',
    trendingDown: 'Trending downwards',
    trendMessage: (perWeek: number) =>
      `Systolic has moved about ${perWeek} mmHg per week over this period. Single readings vary a lot, so treat this as a nudge to keep measuring rather than a conclusion.`,
    disclaimer:
      'Heart History keeps a record. It does not diagnose anything — talk to a doctor about what your readings mean.',
  },

  history: {
    allLevels: 'All levels',
    normal: 'Normal',
    highNormal: 'High-normal',
    raised: 'Raised',
    custom: 'Custom',
    from: 'FROM',
    to: 'TO',
    range: 'Range',
    systolicShort: 'systolic',
    emptyTitle: 'Nothing recorded yet',
    emptyPeriodTitle: 'Nothing in this period',
    emptyMessage:
      'Scan your monitor or add a reading by hand to start building a history.',
    emptyPeriodMessage: 'Try a wider date range, or clear the level filter.',
    addReading: 'Add a reading',
    today: 'Today',
    yesterday: 'Yesterday',
  },

  ranges: {
    week: 'Week',
    month: 'Month',
    threeMonths: '3 months',
    year: 'Year',
    all: 'All',
  },

  bpRanges: {
    title: 'Blood pressure ranges',
    open: 'Ranges and thresholds',
    openHint: 'Look up what “optimal” or “grade 1” means — and move the lines if you need to.',
    whichScale: 'Which scale',
    tableTitle: 'The ranges',
    category: 'Category',
    worseWins:
      'Systolic and diastolic are graded separately and the worse of the two decides the category. That is why 125/95 is grade 1 rather than normal.',
    under: (value: number) => `under ${value}`,
    orMore: (value: number) => `${value} or more`,
    boundaries: 'Adjust the thresholds',
    boundariesHint:
      'Each row is the point where the next category begins — systolic / diastolic.',
    lowBelow: 'Low below',
    startsAt: (category: string) => `${category} starts at`,
    save: 'Save thresholds',
    savedMessage: 'Saved. Every reading has been reclassified.',
    resetStandard: 'Back to ESH',
    resetHome: 'Back to home',
    mustRise: (category: string, column: 'systolic' | 'diastolic') =>
      `The ${column} value for “${category}” has to sit above the category below it. The thresholds must rise from top to bottom.`,
    whatItMeans: 'What the categories mean',
    disclaimer:
      'These ranges describe a single measurement. They are not a diagnosis — individual readings vary widely, and only a clinician reading a series can say anything about your health.',
  },

  trends: {
    bloodPressure: 'Blood pressure',
    notEnoughTitle: 'Not enough to chart yet',
    notEnoughMessage:
      'Two or more readings in the selected period are needed before a trend means anything.',
    grouped: (readings: number, points: number) =>
      `${readings} readings grouped into ${points} points. Tap a point for its average.`,
    steady: 'Holding steady',
    driftingUp: 'Drifting upwards',
    driftingDown: 'Drifting downwards',
    steadyMessage:
      'No clear direction over this period — readings are varying around a stable level.',
    driftMessage: (sys: number, dia: number) =>
      `Systolic is moving about ${sys} mmHg per week and diastolic about ${dia} mmHg. Individual readings scatter widely, so this describes the period rather than predicting the next one.`,
    thisPeriod: 'This period',
    pulsePressure: 'Pulse pressure',
    pulsePressureHint: 'gap between the two',
    meanArterial: 'Mean arterial',
    variation: 'Variation',
    variationHint: 'systolic sd',
    averageSitsAt: 'The average reading for this period sits at:',
    distribution: 'How readings were spread',
    byTimeOfDay: 'By time of day',
    byTimeOfDayNote:
      'Blood pressure follows a daily rhythm, so morning and evening readings are not directly comparable.',
    irregularTitle: 'Irregular heartbeat detected',
    irregularMessage: (flagged: number, total: number) =>
      `The monitor flagged an irregular heartbeat on ${flagged} of ${total} readings in this period. Occasional flags are common; a persistent pattern is worth mentioning to a doctor.`,
  },

  dayParts: {
    morning: 'Morning',
    afternoon: 'Afternoon',
    evening: 'Evening',
    night: 'Night',
  },

  settings: {
    people: 'People',
    peopleHint:
      'Each person keeps a separate history. Readings you record go to whoever is selected here.',
    appearance: 'Appearance',
    themeSystem: 'Automatic',
    themeLight: 'Light',
    themeDark: 'Dark',
    language: 'Language',
    languageSystem: 'Automatic',
    languageHint:
      'On "Automatic" the app follows your phone\'s language, when it is one of the supported ones.',
    classification: 'Classification',
    scaleStandard: 'Standard (ESH)',
    scaleHome: 'Home thresholds',
    scaleStandardHint:
      'Uses the standard ESH/ESC thresholds — the same scale your monitor\'s own traffic-light indicator is based on, so the app and the device agree.',
    scaleHomeHint:
      'Uses the lower thresholds recommended for self-measurement (hypertension from 135/85). Readings taken at home tend to run a few mmHg below clinic readings.',
    scaleCustom: 'Custom',
    scaleCustomHint:
      'Uses thresholds you set yourself. Useful if a clinician has given you different targets. Edit them under “Ranges and thresholds”.',
    scanning: 'Scanning',
    keepPhotos: 'Keep the photos',
    keepPhotosHint:
      'Stores each scanned picture with its reading so you can check it later. Uses more space.',
    assistedReading: 'Assisted reading',
    assistedReadingHint:
      'Optional. Sends the photo to a vision model on your own machine, which reads the display far more reliably than this device can. The server keeps nothing. The address and token are shown when the server starts. Leave empty to read only on the device.',
    testConnection: 'Test connection',
    save: 'Save',
    serverReachable: 'Server reachable, model loaded.',
    tokenPlaceholder: 'Access token',
    serverUnauthorised:
      'Token rejected. Get the current one with "python server/ocr_server.py --show-token".',
    serverUnreachable: 'No answer. Check the address and port, and that both services are running.',
    serverNoPermission:
      'This build has no network access at all, so assisted reading cannot work. Build it with "npm run build:apk:assisted".',
    assistedReadingOn: (url: string) => `On: photos go to ${url}.`,
    assistedReadingOff: 'Off: photos are read only on this device.',
    export: 'Export',
    reportPdf: "Doctor's report (PDF)",
    backupJson: 'Backup file (JSON)',
    spreadsheetCsv: 'Spreadsheet (CSV)',
    exportHint:
      'A backup file restores everything exactly. CSV opens in any spreadsheet. The report is a printable summary with charts.',
    restore: 'Restore',
    mergeBackup: 'Merge a backup',
    replaceEverything: 'Replace everything',
    restoreHint:
      'Merging adds anything missing and leaves what you already have untouched, so importing the same file twice is safe.',
    replaceTitle: 'Replace everything?',
    replaceMessage:
      'Every reading currently on this phone will be deleted and replaced with the contents of the backup. This cannot be undone.',
    replaceConfirm: 'Replace',
    about: 'About',
    version: 'Version',
    readingsStored: 'Readings stored',
    privacyTitle: 'Everything stays on this phone',
    privacyMessage:
      'Photos are read on the device itself. Heart History has no server, and the released app is built without network access at all — so your readings cannot leave this phone unless you export them yourself.',
    privacyAssistedTitle: 'Photos go to your own server',
    privacyAssistedMessage: (url: string) =>
      `Assisted reading is on: every scanned photo is sent to ${url} and read there. It is not stored and it does not leave your network. All readings and photos stay on this phone. Clear the field under "Assisted reading" to go back to reading only on the device.`,
    medicalDisclaimer:
      'Heart History records measurements. It is not a medical device and does not diagnose anything — please discuss what your readings mean with a doctor.',
    exportedCount: (n: number) =>
      `Exported ${n} reading${n === 1 ? '' : 's'}.`,
    backedUpCount: (n: number) =>
      `Backed up ${n} reading${n === 1 ? '' : 's'}.`,
    somethingWrong: 'Something went wrong.',
  },

  profiles: {
    intro:
      'Everyone gets their own history, charts and targets — useful when a monitor is shared at home.',
    defaultName: 'Me',
    addSomeone: 'Add someone',
    name: 'Name',
    active: 'ACTIVE',
    useThisPerson: 'Use this person',
    personalTarget: 'Personal target (optional)',
    personalTargetHint:
      'Drawn as a goal line on the charts. Ask a doctor what target is right — it is not the same for everyone.',
    cannotRemoveTitle: 'Cannot remove',
    cannotRemoveMessage: 'At least one person has to remain.',
    removeTitle: (name: string) => `Remove ${name}?`,
    removeMessage:
      'Every reading recorded for this person will be deleted too. This cannot be undone.',
  },

  scan: {
    permissionTitle: 'Camera access is needed to read your monitor',
    permissionMessage:
      'Photos are analysed on this phone and never uploaded anywhere. You can also pick an existing photo instead.',
    permissionMessageAssisted:
      'Photos are sent to your own reading server and analysed there — they do not leave your network. You can also pick an existing photo instead.',
    allowCamera: 'Allow camera',
    choosePhoto: 'Choose a photo',
    goBack: 'Go back',
    hint: 'Fill the frame with the display. Keep it flat-on and avoid reflections.',
    reading: 'Reading the display…',
    noPicture: 'The camera did not return a picture. Try again.',
    couldNotRead: (message: string) => `Could not read that image: ${message}`,
    couldNotReadGeneric: 'Could not read that image.',
    close: 'Close',
    torch: 'Toggle torch',
    fromGallery: 'Choose from photos',
    typeInstead: 'Type it in instead',
    takePicture: 'Take a picture',
  },

  review: {
    okTitle: 'Read successfully',
    okMessage:
      'Check the numbers against your monitor before saving — it takes a second and it is the only safeguard against a misread.',
    checkTitle: 'Please check these numbers',
    failTitle: 'Could not read the display',
    failMessage:
      'The display was not legible enough to be sure. Fill in the values by hand, or take another photo with less glare.',
    photoAlt: 'The photo that was analysed',
    deviceShowed: (text: string) => `The monitor showed “${text}”`,
    deviceHintNote: (date: string) =>
      `This reading is filed under ${date}. The monitor alternates between a date and a clock, so it is only a hint.`,
    useIt: 'Use it',
    retake: 'Retake',
    saveReading: 'Save reading',
    nothingTitle: 'Nothing to review',
    nothingMessage: 'That scan has already been saved or dismissed.',
    scanAgain: 'Scan again',
    readingTitle: 'Reading the display …',
    readingOnDevice: 'Being read on this device.',
    readingAssisted: 'Being read by your reading server.',
    typeInstead: 'Type it in instead',
    assistedFellBack:
      'The reading server could not be reached, so the display was read on the device instead — which is markedly worse on difficult photos.',
    assistedNoPermission:
      'This build has no network access, so the display was read on the device. Assisted reading needs a build made with "npm run build:apk:assisted".',
    assistedUnauthorised:
      'The reading server rejected the token, so the display was read on the device. Check the token under Settings › Assisted reading.',
    readByAssisted: 'Read by your reading server',
    irregularTitle: 'Irregular heartbeat symbol',
    irregularMessage:
      'The monitor was showing its irregular-heartbeat symbol, so this reading has been marked accordingly. An occasional flag is common; if it keeps appearing, mention it to a doctor.',
  },

  form: {
    measurement: 'Measurement',
    when: 'When',
    whenTitle: 'When was this measured?',
    context: 'Context',
    contextHint: 'Optional, but it makes the history far more useful later.',
    arm: 'Arm',
    left: 'Left',
    right: 'Right',
    leftArm: 'Left arm',
    rightArm: 'Right arm',
    position: 'Position',
    sitting: 'Sitting',
    lying: 'Lying',
    standing: 'Standing',
    irregularHeartbeat: 'Irregular heartbeat',
    irregularHeartbeatHint: 'The monitor showed its irregular-heartbeat symbol',
    tagsAndNotes: 'Tags and notes',
    notePlaceholder: 'Anything worth remembering about this reading…',
    scanInstead: 'Scan instead',
    tags: {
      beforeMedication: 'Before medication',
      afterMedication: 'After medication',
      afterExercise: 'After exercise',
      stressed: 'Stressed',
      rested: 'Rested',
      afterCoffee: 'After coffee',
      unwell: 'Unwell',
    },
    errors: {
      needBoth: 'Enter both a systolic and a diastolic value.',
      systolicNotHigher:
        'The systolic value (the upper one) must be higher than the diastolic.',
      systolicRange: (value: number) =>
        `A systolic of ${value} is outside the range a home monitor produces.`,
      diastolicRange: (value: number) =>
        `A diastolic of ${value} is outside the range a home monitor produces.`,
      pulseRange: (value: number) =>
        `A pulse of ${value} is outside the range a home monitor produces.`,
    },
    increase: (label: string) => `Increase ${label}`,
    decrease: (label: string) => `Decrease ${label}`,
  },

  detail: {
    details: 'Details',
    measured: 'Measured',
    source: 'Source',
    scanned: 'Scanned',
    scannedWith: (percent: number) => `Scanned · ${percent}% confidence`,
    imported: 'Imported',
    manual: 'Entered by hand',
    monitorShowed: 'Monitor showed',
    flag: 'Flag',
    note: 'Note',
    photoAlt: 'The photo this reading was scanned from',
    deleteTitle: 'Delete this reading?',
    deleteMessage:
      'It will be removed from your history and charts. This cannot be undone.',
    notFoundTitle: 'Reading not found',
    notFoundMessage: 'It may have been deleted.',
    backToHistory: 'Back to history',
    at: 'at',
  },

  picker: {
    pickDate: 'Pick a date',
    time: 'Time',
    previousMonth: 'Previous month',
    nextMonth: 'Next month',
    hours: 'Hours',
    minutes: 'Minutes',
    up: 'up',
    down: 'down',
  },

  chart: {
    notEnough: 'Not enough readings yet',
    averageOf: (n: number) => `average of ${n}`,
  },

  categories: {
    low: { label: 'Low', short: 'Low' },
    optimal: { label: 'Optimal', short: 'Optimal' },
    normal: { label: 'Normal', short: 'Normal' },
    highNormal: { label: 'High normal', short: 'High-normal' },
    grade1: { label: 'Grade 1 hypertension', short: 'Grade 1' },
    grade2: { label: 'Grade 2 hypertension', short: 'Grade 2' },
    grade3: { label: 'Grade 3 hypertension', short: 'Grade 3' },
  },

  categoryDescriptions: {
    low: 'Below the usual range. Common and often harmless, but worth mentioning if you feel faint or dizzy.',
    optimal: 'In the ideal range.',
    normal: 'Within the normal range.',
    highNormal: 'Slightly raised. Worth keeping an eye on over the coming weeks.',
    grade1:
      'Mildly raised. Repeated readings in this range are worth discussing with a doctor.',
    grade2: 'Moderately raised. Worth discussing with a doctor.',
    grade3: 'Severely raised. Please seek medical advice.',
  },

  ocr: {
    noContent: 'No display-like content found. Move closer and fill the frame.',
    noDigits: 'Could not find any digits. Reduce glare and fill the frame.',
    noValueRows: 'Could not locate the value rows.',
    noDigitsRead: 'Found the display but could not read any digits.',
    recognitionFailed: 'Recognition failed.',
    errorCode: 'The display appears to be showing an error code, not a measurement.',
    systolicNotAbove:
      'Systolic is not above diastolic — one of the two rows was misread.',
    implausibleGap: (gap: number) =>
      `The gap between the two numbers (${gap}) is outside the plausible range.`,
    partialRow: (field: string) => `Only part of the ${field} row was readable.`,
    implausibleValue: (field: string, value: number, min: number, max: number) =>
      `Ignored an implausible ${field} reading of ${value} (expected ${min}-${max}).`,
    missingRows: (found: number) =>
      `Only ${found} of 3 value rows were found.`,
    pulseUnreadable:
      'The pulse could not be read reliably and was left out. Blood pressure was read.',
    isAverage:
      'The display shows the stored average (A), not a single measurement.',
    selfTest:
      'The display is showing the power-on self test (every segment lit), not a measurement.',
    couldNotReadImage: 'Could not read the image data.',
  },

  fields: {
    systolic: 'systolic',
    diastolic: 'diastolic',
    pulse: 'pulse',
  },

  backup: {
    notJson: 'That file is not valid JSON. Pick a Heart History backup file.',
    notBackup: 'That does not look like a Heart History backup.',
    newerVersion:
      'That backup was made by a newer version of Heart History. Update the app first.',
    nothingUnderstood:
      'That backup contained no readings this version understands.',
    restored: (readings: number, profiles: number, skipped: number) => {
      let text = `Restored ${readings} reading${readings === 1 ? '' : 's'}`;
      if (profiles > 0) {
        text += ` and ${profiles} person${profiles === 1 ? '' : 's'}`;
      }
      if (skipped > 0) {
        text += `. ${skipped} entr${skipped === 1 ? 'y was' : 'ies were'} unreadable and skipped`;
      }
      return `${text}.`;
    },
    couldNotRead: (detail: string) =>
      `Could not read that file. Try picking it from the file manager rather than a cloud app. (${detail})`,
    saveDialog: 'Save your Heart History backup',
    csvDialog: 'Export readings as CSV',
    reportDialog: 'Share your blood pressure report',
  },

  report: {
    title: 'Blood pressure report',
    period: 'Period',
    average: 'Average',
    systolicRange: 'Systolic range',
    diastolicRange: 'Diastolic range',
    sevenDay: (sys: number, dia: number, count: number, days: number) =>
      `7-day morning & evening average: ${sys}/${dia} mmHg — from ${count} readings across ${days} ${days === 1 ? 'day' : 'days'}.`,
    trend: 'Trend',
    distribution: 'Distribution',
    byTimeOfDay: 'By time of day',
    allReadings: 'All readings',
    period_: 'Period',
    date: 'Date',
    time: 'Time',
    sys: 'Sys',
    dia: 'Dia',
    pulse: 'Pulse',
    category: 'Category',
    notes: 'Notes',
    trendNote: (sys: string, dia: string, fit: number) =>
      `Over this period systolic moved about ${sys} mmHg per week and diastolic ${dia} mmHg per week (line fit r² = ${fit}). Individual readings vary widely; a low fit means the trend line should not be read as a prediction.`,
    footerNote:
      'Readings were taken at home with a personal monitor and recorded in Heart History. Home measurements typically run a little lower than those taken in a clinic. This report is a record of measurements, not a diagnosis.',
    generated: (date: string) => `Generated ${date} · Heart History`,
  },
};
