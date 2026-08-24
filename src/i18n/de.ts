/**
 * German — the default language, and the source of truth for the dictionary
 * shape. Every other language is type-checked against this object, so adding a
 * string here is a compile error until it is translated everywhere.
 *
 * Swiss orthography throughout: "ss" rather than "ß".
 */
export const de = {
  languageName: 'Deutsch',

  common: {
    cancel: 'Abbrechen',
    done: 'Fertig',
    save: 'Speichern',
    saveChanges: 'Änderungen speichern',
    delete: 'Löschen',
    remove: 'Entfernen',
    edit: 'Bearbeiten',
    add: 'Hinzufügen',
    seeAll: 'Alle anzeigen',
    manage: 'Verwalten',
    retry: 'Erneut versuchen',
    mmHg: 'mmHg',
    bpm: '/min',
    systolic: 'Systolisch',
    diastolic: 'Diastolisch',
    pulse: 'Puls',
    upper: 'oberer Wert',
    lower: 'unterer Wert',
    optional: 'optional',
    average: 'Durchschnitt',
    readings: 'Messungen',
    readingCount: (n: number) => (n === 1 ? '1 Messung' : `${n} Messungen`),
    dayCount: (n: number) => (n === 1 ? '1 Tag' : `${n} Tagen`),
  },

  relative: {
    justNow: 'gerade eben',
    minutes: (n: number) => `vor ${n} Min.`,
    hours: (n: number) => `vor ${n} Std.`,
    yesterday: 'gestern',
    days: (n: number) => `vor ${n} Tagen`,
    months: (n: number) => (n === 1 ? 'vor 1 Monat' : `vor ${n} Monaten`),
    years: (n: number) => (n === 1 ? 'vor 1 Jahr' : `vor ${n} Jahren`),
  },

  tabs: {
    today: 'Heute',
    history: 'Verlauf',
    trends: 'Trends',
    settings: 'Einstellungen',
  },

  screens: {
    review: 'Messung prüfen',
    entry: 'Messung erfassen',
    reading: 'Messung',
    editReading: 'Messung bearbeiten',
    profiles: 'Personen',
  },

  boot: {
    failedTitle: 'Heart History konnte nicht starten',
    genericError: 'Deine Daten konnten nicht geladen werden.',
  },

  home: {
    latestReading: 'LETZTE MESSUNG',
    noReadingsTitle: 'Noch keine Messungen',
    noReadingsMessage:
      'Richte die Kamera auf dein Blutdruckmessgerät — Heart History liest die Werte für dich ab. Oder gib sie von Hand ein.',
    scanRunning: 'Anzeige wird gelesen …',
    scanReady: 'Messung bereit zum Prüfen',
    scanFailed: 'Anzeige konnte nicht gelesen werden',
    scanMonitor: 'Gerät scannen',
    sevenDayAverage: '7-Tage-Durchschnitt',
    sevenDayNote: (days: number, count: number) =>
      `Morgen- und Abendmessungen über ${days === 1 ? '1 Tag' : `${days} Tage`} (${count} ${count === 1 ? 'Messung' : 'Messungen'}). Das ist der Durchschnitt, den Leitlinien zur Selbstmessung empfehlen.`,
    last30Days: 'Letzte 30 Tage',
    recent: 'Zuletzt',
    trendingUp: 'Tendenz steigend',
    trendingDown: 'Tendenz fallend',
    trendMessage: (perWeek: number) =>
      `Der systolische Wert hat sich in diesem Zeitraum um rund ${perWeek} mmHg pro Woche verändert. Einzelmessungen schwanken stark — nimm das als Anlass weiterzumessen, nicht als Schlussfolgerung.`,
    disclaimer:
      'Heart History führt Buch. Es stellt keine Diagnose — sprich mit einer Ärztin oder einem Arzt darüber, was deine Werte bedeuten.',
  },

  history: {
    allLevels: 'Alle Stufen',
    normal: 'Normal',
    highNormal: 'Hochnormal',
    raised: 'Erhöht',
    custom: 'Zeitraum',
    from: 'VON',
    to: 'BIS',
    range: 'Spanne',
    systolicShort: 'systolisch',
    emptyTitle: 'Noch nichts erfasst',
    emptyPeriodTitle: 'Nichts in diesem Zeitraum',
    emptyMessage:
      'Scanne dein Messgerät oder erfasse eine Messung von Hand, um einen Verlauf aufzubauen.',
    emptyPeriodMessage:
      'Wähle einen grösseren Zeitraum oder hebe den Filter nach Stufe auf.',
    addReading: 'Messung erfassen',
    today: 'Heute',
    yesterday: 'Gestern',
  },

  ranges: {
    week: 'Woche',
    month: 'Monat',
    threeMonths: '3 Monate',
    year: 'Jahr',
    all: 'Alle',
  },

  trends: {
    bloodPressure: 'Blutdruck',
    notEnoughTitle: 'Noch zu wenig für ein Diagramm',
    notEnoughMessage:
      'Für einen aussagekräftigen Verlauf braucht es mindestens zwei Messungen im gewählten Zeitraum.',
    grouped: (readings: number, points: number) =>
      `${readings} Messungen zu ${points} Punkten zusammengefasst. Tippe einen Punkt für den Durchschnitt.`,
    steady: 'Stabil',
    driftingUp: 'Leicht steigend',
    driftingDown: 'Leicht fallend',
    steadyMessage:
      'Keine klare Richtung in diesem Zeitraum — die Werte schwanken um ein stabiles Niveau.',
    driftMessage: (sys: number, dia: number) =>
      `Der systolische Wert verändert sich um rund ${sys} mmHg pro Woche, der diastolische um rund ${dia} mmHg. Einzelmessungen streuen stark — das beschreibt den Zeitraum, es sagt nichts über die nächste Messung.`,
    thisPeriod: 'Dieser Zeitraum',
    // "Blutdruckamplitude" is the fuller term but has no break point, so in a
    // three-across stat grid it splits mid-word into "BLUTDRUCKAM / PLITUDE".
    // "Pulsdruck" is the standard German equivalent and fits; the hint below it
    // keeps it from being read as a pulse rate.
    pulsePressure: 'Pulsdruck',
    pulsePressureHint: 'Abstand der beiden Werte',
    meanArterial: 'Mittlerer Druck',
    variation: 'Streuung',
    variationHint: 'systolisch, SD',
    averageSitsAt: 'Der Durchschnitt dieses Zeitraums liegt bei:',
    distribution: 'Verteilung der Messungen',
    byTimeOfDay: 'Nach Tageszeit',
    byTimeOfDayNote:
      'Der Blutdruck folgt einem Tagesrhythmus. Morgen- und Abendmessungen sind deshalb nicht direkt vergleichbar.',
    irregularTitle: 'Unregelmässiger Herzschlag erkannt',
    irregularMessage: (flagged: number, total: number) =>
      `Das Messgerät hat bei ${flagged} von ${total} Messungen einen unregelmässigen Herzschlag angezeigt. Einzelne Hinweise sind häufig; ein anhaltendes Muster ist einen Arztbesuch wert.`,
  },

  dayParts: {
    morning: 'Morgen',
    afternoon: 'Nachmittag',
    evening: 'Abend',
    night: 'Nacht',
  },

  settings: {
    people: 'Personen',
    peopleHint:
      'Jede Person hat einen eigenen Verlauf. Neue Messungen gehen an die hier ausgewählte Person.',
    appearance: 'Darstellung',
    themeSystem: 'Automatisch',
    themeLight: 'Hell',
    themeDark: 'Dunkel',
    language: 'Sprache',
    languageSystem: 'Automatisch',
    languageHint:
      'Bei «Automatisch» folgt die App der Sprache deines Telefons, sofern sie unterstützt wird.',
    classification: 'Einstufung',
    scaleStandard: 'Standard (ESH)',
    scaleHome: 'Heim-Grenzwerte',
    scaleStandardHint:
      'Verwendet die ESH/ESC-Grenzwerte — dieselbe Skala, auf der die Ampelanzeige deines Messgeräts beruht. So sind App und Gerät sich einig.',
    scaleHomeHint:
      'Verwendet die tieferen Grenzwerte für die Selbstmessung (Bluthochdruck ab 135/85). Zu Hause gemessene Werte liegen meist etwas unter denen in der Praxis.',
    scanning: 'Scannen',
    keepPhotos: 'Fotos behalten',
    keepPhotosHint:
      'Speichert jedes gescannte Bild bei der Messung, damit du es später prüfen kannst. Braucht mehr Speicher.',
    assistedReading: 'Unterstütztes Lesen',
    assistedReadingHint:
      'Optional. Schickt das Foto an ein Bildmodell auf deinem eigenen Rechner, das die Anzeige deutlich zuverlässiger liest als dieses Gerät. Das Foto verlässt dein Netzwerk nicht und wird auf dem Server nicht gespeichert. Leer lassen, um ausschliesslich auf dem Gerät zu lesen.',
    testConnection: 'Verbindung testen',
    save: 'Speichern',
    serverReachable: 'Server erreichbar, Modell geladen.',
    serverUnreachable:
      'Keine Antwort. Prüfe Adresse und Port und ob beide Dienste laufen.',
    assistedReadingOn: (url: string) => `Aktiv: Fotos gehen an ${url}.`,
    assistedReadingOff: 'Aus: Fotos werden ausschliesslich auf diesem Gerät gelesen.',
    export: 'Exportieren',
    reportPdf: 'Arztbericht (PDF)',
    backupJson: 'Sicherung (JSON)',
    spreadsheetCsv: 'Tabelle (CSV)',
    exportHint:
      'Eine Sicherung stellt alles exakt wieder her. CSV öffnet sich in jeder Tabellenkalkulation. Der Bericht ist eine druckbare Übersicht mit Diagrammen.',
    restore: 'Wiederherstellen',
    mergeBackup: 'Sicherung zusammenführen',
    replaceEverything: 'Alles ersetzen',
    restoreHint:
      'Beim Zusammenführen wird nur ergänzt, was fehlt — Vorhandenes bleibt unberührt. Dieselbe Datei zweimal zu importieren ist deshalb unbedenklich.',
    replaceTitle: 'Wirklich alles ersetzen?',
    replaceMessage:
      'Alle Messungen auf diesem Telefon werden gelöscht und durch den Inhalt der Sicherung ersetzt. Das lässt sich nicht rückgängig machen.',
    replaceConfirm: 'Ersetzen',
    about: 'Über die App',
    version: 'Version',
    readingsStored: 'Gespeicherte Messungen',
    privacyTitle: 'Alles bleibt auf diesem Telefon',
    privacyMessage:
      'Fotos werden auf dem Gerät selbst ausgewertet. Heart History hat keinen Server, und die fertige App wird ganz ohne Netzwerkzugriff gebaut — deine Werte können dieses Telefon nur verlassen, wenn du sie selbst exportierst.',
    medicalDisclaimer:
      'Heart History erfasst Messwerte. Es ist kein Medizinprodukt und stellt keine Diagnose — besprich die Bedeutung deiner Werte bitte mit einer Ärztin oder einem Arzt.',
    exportedCount: (n: number) =>
      `${n} ${n === 1 ? 'Messung' : 'Messungen'} exportiert.`,
    backedUpCount: (n: number) =>
      `${n} ${n === 1 ? 'Messung' : 'Messungen'} gesichert.`,
    somethingWrong: 'Etwas ist schiefgelaufen.',
  },

  profiles: {
    intro:
      'Jede Person hat einen eigenen Verlauf, eigene Diagramme und eigene Zielwerte — praktisch, wenn ein Messgerät zu Hause geteilt wird.',
    defaultName: 'Ich',
    addSomeone: 'Person hinzufügen',
    name: 'Name',
    active: 'AKTIV',
    useThisPerson: 'Diese Person verwenden',
    personalTarget: 'Persönlicher Zielwert (optional)',
    personalTargetHint:
      'Wird als Ziellinie in den Diagrammen gezeichnet. Welcher Zielwert richtig ist, ist individuell — frag bitte deine Ärztin oder deinen Arzt.',
    cannotRemoveTitle: 'Nicht möglich',
    cannotRemoveMessage: 'Es muss mindestens eine Person übrig bleiben.',
    removeTitle: (name: string) => `${name} entfernen?`,
    removeMessage:
      'Alle für diese Person erfassten Messungen werden ebenfalls gelöscht. Das lässt sich nicht rückgängig machen.',
  },

  scan: {
    permissionTitle: 'Für das Ablesen wird die Kamera benötigt',
    permissionMessage:
      'Fotos werden auf diesem Telefon ausgewertet und nirgendwohin hochgeladen. Du kannst stattdessen auch ein vorhandenes Foto auswählen.',
    allowCamera: 'Kamera erlauben',
    choosePhoto: 'Foto auswählen',
    goBack: 'Zurück',
    hint: 'Fülle den Rahmen mit der Anzeige. Möglichst frontal und ohne Spiegelungen.',
    reading: 'Anzeige wird gelesen …',
    noPicture: 'Die Kamera hat kein Bild geliefert. Bitte nochmals versuchen.',
    couldNotRead: (message: string) =>
      `Dieses Bild konnte nicht gelesen werden: ${message}`,
    couldNotReadGeneric: 'Dieses Bild konnte nicht gelesen werden.',
    close: 'Schliessen',
    torch: 'Licht ein- oder ausschalten',
    fromGallery: 'Aus Fotos wählen',
    typeInstead: 'Stattdessen eintippen',
    takePicture: 'Foto aufnehmen',
  },

  review: {
    okTitle: 'Erfolgreich gelesen',
    okMessage:
      'Vergleiche die Werte kurz mit deinem Messgerät, bevor du speicherst — das ist die einzige Absicherung gegen einen Lesefehler.',
    checkTitle: 'Bitte diese Werte prüfen',
    failTitle: 'Anzeige konnte nicht gelesen werden',
    failMessage:
      'Die Anzeige war nicht eindeutig genug. Trage die Werte von Hand ein oder mach ein neues Foto mit weniger Spiegelungen.',
    photoAlt: 'Das ausgewertete Foto',
    deviceShowed: (text: string) => `Das Messgerät zeigte «${text}»`,
    deviceHintNote: (date: string) =>
      `Diese Messung ist unter ${date} abgelegt. Das Gerät wechselt zwischen Datum und Uhrzeit — das ist deshalb nur ein Hinweis.`,
    useIt: 'Übernehmen',
    retake: 'Neu aufnehmen',
    saveReading: 'Messung speichern',
    nothingTitle: 'Nichts zu prüfen',
    nothingMessage: 'Dieser Scan wurde bereits gespeichert oder verworfen.',
    scanAgain: 'Erneut scannen',
    readingTitle: 'Anzeige wird gelesen …',
    readingOnDevice: 'Wird auf diesem Gerät ausgewertet.',
    readingAssisted: 'Wird von deinem Lese-Server ausgewertet.',
    typeInstead: 'Von Hand eintragen',
    assistedFellBack:
      'Der Lese-Server war nicht erreichbar — die Anzeige wurde auf dem Gerät gelesen, was bei schwierigen Fotos deutlich schlechter funktioniert.',
    readByAssisted: 'Vom Lese-Server gelesen',
  },

  form: {
    measurement: 'Messwerte',
    when: 'Wann',
    whenTitle: 'Wann wurde gemessen?',
    context: 'Umstände',
    contextHint: 'Freiwillig — macht den Verlauf später aber deutlich nützlicher.',
    arm: 'Arm',
    left: 'Links',
    right: 'Rechts',
    leftArm: 'Linker Arm',
    rightArm: 'Rechter Arm',
    position: 'Position',
    sitting: 'Sitzend',
    lying: 'Liegend',
    standing: 'Stehend',
    irregularHeartbeat: 'Unregelmässiger Herzschlag',
    irregularHeartbeatHint: 'Das Messgerät zeigte sein Symbol dafür an',
    tagsAndNotes: 'Schlagwörter und Notiz',
    notePlaceholder: 'Etwas, das zu dieser Messung erwähnenswert ist …',
    scanInstead: 'Stattdessen scannen',
    tags: {
      beforeMedication: 'Vor Medikament',
      afterMedication: 'Nach Medikament',
      afterExercise: 'Nach Bewegung',
      stressed: 'Gestresst',
      rested: 'Ausgeruht',
      afterCoffee: 'Nach Kaffee',
      unwell: 'Unwohl',
    },
    errors: {
      needBoth: 'Bitte trage einen systolischen und einen diastolischen Wert ein.',
      systolicNotHigher:
        'Der systolische Wert (der obere) muss höher sein als der diastolische.',
      systolicRange: (value: number) =>
        `Ein systolischer Wert von ${value} liegt ausserhalb dessen, was ein Heimmessgerät anzeigt.`,
      diastolicRange: (value: number) =>
        `Ein diastolischer Wert von ${value} liegt ausserhalb dessen, was ein Heimmessgerät anzeigt.`,
      pulseRange: (value: number) =>
        `Ein Puls von ${value} liegt ausserhalb dessen, was ein Heimmessgerät anzeigt.`,
    },
    increase: (label: string) => `${label} erhöhen`,
    decrease: (label: string) => `${label} verringern`,
  },

  detail: {
    details: 'Details',
    measured: 'Gemessen',
    source: 'Quelle',
    scanned: 'Gescannt',
    scannedWith: (percent: number) => `Gescannt · ${percent} % Sicherheit`,
    imported: 'Importiert',
    manual: 'Von Hand erfasst',
    monitorShowed: 'Gerät zeigte',
    flag: 'Hinweis',
    note: 'Notiz',
    photoAlt: 'Das Foto, aus dem diese Messung gelesen wurde',
    deleteTitle: 'Diese Messung löschen?',
    deleteMessage:
      'Sie verschwindet aus deinem Verlauf und aus den Diagrammen. Das lässt sich nicht rückgängig machen.',
    notFoundTitle: 'Messung nicht gefunden',
    notFoundMessage: 'Sie wurde möglicherweise gelöscht.',
    backToHistory: 'Zurück zum Verlauf',
    at: 'um',
  },

  picker: {
    pickDate: 'Datum wählen',
    time: 'Uhrzeit',
    previousMonth: 'Vorheriger Monat',
    nextMonth: 'Nächster Monat',
    hours: 'Stunden',
    minutes: 'Minuten',
    up: 'auf',
    down: 'ab',
  },

  chart: {
    notEnough: 'Noch zu wenige Messungen',
    averageOf: (n: number) => `Durchschnitt aus ${n}`,
  },

  categories: {
    low: { label: 'Niedrig', short: 'Niedrig' },
    optimal: { label: 'Optimal', short: 'Optimal' },
    normal: { label: 'Normal', short: 'Normal' },
    highNormal: { label: 'Hochnormal', short: 'Hochnormal' },
    grade1: { label: 'Bluthochdruck Grad 1', short: 'Grad 1' },
    grade2: { label: 'Bluthochdruck Grad 2', short: 'Grad 2' },
    grade3: { label: 'Bluthochdruck Grad 3', short: 'Grad 3' },
  },

  categoryDescriptions: {
    low: 'Unter dem üblichen Bereich. Meist harmlos, aber erwähnenswert, wenn dir schwindlig wird.',
    optimal: 'Im idealen Bereich.',
    normal: 'Im normalen Bereich.',
    highNormal: 'Leicht erhöht. In den nächsten Wochen im Auge behalten.',
    grade1:
      'Leicht erhöht. Wiederholte Werte in diesem Bereich sind einen Arztbesuch wert.',
    grade2: 'Deutlich erhöht. Besprich das mit einer Ärztin oder einem Arzt.',
    grade3: 'Stark erhöht. Bitte hole ärztlichen Rat ein.',
  },

  /** Messages produced by the recogniser, keyed by the code it returns. */
  ocr: {
    noContent: 'Keine Anzeige erkannt. Geh näher heran und fülle den Bildausschnitt.',
    noDigits:
      'Keine Ziffern gefunden. Verringere Spiegelungen und fülle den Bildausschnitt.',
    noValueRows: 'Die Wertezeilen liessen sich nicht finden.',
    noDigitsRead: 'Die Anzeige wurde gefunden, aber keine Ziffer war lesbar.',
    recognitionFailed: 'Die Erkennung ist fehlgeschlagen.',
    errorCode: 'Die Anzeige zeigt offenbar einen Fehlercode und keine Messung.',
    systolicNotAbove:
      'Der systolische Wert liegt nicht über dem diastolischen — eine der beiden Zeilen wurde falsch gelesen.',
    implausibleGap: (gap: number) =>
      `Der Abstand zwischen den beiden Werten (${gap}) liegt ausserhalb des plausiblen Bereichs.`,
    partialRow: (field: string) => `Nur ein Teil der Zeile «${field}» war lesbar.`,
    implausibleValue: (field: string, value: number, min: number, max: number) =>
      `Ein unplausibler Wert für ${field} (${value}) wurde ignoriert; erwartet werden ${min}–${max}.`,
    missingRows: (found: number) =>
      `Es wurden nur ${found} von 3 Wertezeilen gefunden.`,
    pulseUnreadable:
      'Der Puls war nicht sicher lesbar und wurde weggelassen. Blutdruck wurde gelesen.',
    isAverage:
      'Die Anzeige zeigt den gespeicherten Durchschnitt (A) und keine Einzelmessung.',
    selfTest:
      'Die Anzeige zeigt den Selbsttest beim Einschalten (alle Segmente leuchten) und keine Messung.',
    couldNotReadImage: 'Die Bilddaten konnten nicht gelesen werden.',
  },

  fields: {
    systolic: 'den systolischen Wert',
    diastolic: 'den diastolischen Wert',
    pulse: 'den Puls',
  },

  backup: {
    notJson:
      'Diese Datei ist kein gültiges JSON. Wähle eine Heart-History-Sicherung.',
    notBackup: 'Das sieht nicht nach einer Heart-History-Sicherung aus.',
    newerVersion:
      'Diese Sicherung stammt aus einer neueren Version von Heart History. Bitte aktualisiere zuerst die App.',
    nothingUnderstood:
      'Diese Sicherung enthielt keine Messungen, die diese Version versteht.',
    restored: (readings: number, profiles: number, skipped: number) => {
      let text = `${readings} ${readings === 1 ? 'Messung' : 'Messungen'} wiederhergestellt`;
      if (profiles > 0) {
        text += ` und ${profiles} ${profiles === 1 ? 'Person' : 'Personen'}`;
      }
      if (skipped > 0) {
        text += `. ${skipped} ${skipped === 1 ? 'Eintrag war' : 'Einträge waren'} unlesbar und ${skipped === 1 ? 'wurde' : 'wurden'} übersprungen`;
      }
      return `${text}.`;
    },
    couldNotRead: (detail: string) =>
      `Die Datei liess sich nicht lesen. Wähle sie aus dem Dateimanager statt aus einer Cloud-App. (${detail})`,
    saveDialog: 'Heart-History-Sicherung speichern',
    csvDialog: 'Messungen als CSV exportieren',
    reportDialog: 'Blutdruckbericht teilen',
  },

  report: {
    title: 'Blutdruckbericht',
    period: 'Zeitraum',
    average: 'Durchschnitt',
    systolicRange: 'Systolisch, Spanne',
    diastolicRange: 'Diastolisch, Spanne',
    sevenDay: (sys: number, dia: number, count: number, days: number) =>
      `7-Tage-Durchschnitt morgens und abends: ${sys}/${dia} mmHg — aus ${count} Messungen an ${days} ${days === 1 ? 'Tag' : 'Tagen'}.`,
    trend: 'Verlauf',
    distribution: 'Verteilung',
    byTimeOfDay: 'Nach Tageszeit',
    allReadings: 'Alle Messungen',
    period_: 'Abschnitt',
    date: 'Datum',
    time: 'Zeit',
    sys: 'Sys',
    dia: 'Dia',
    pulse: 'Puls',
    category: 'Einstufung',
    notes: 'Notizen',
    trendNote: (sys: string, dia: string, fit: number) =>
      `In diesem Zeitraum hat sich der systolische Wert um ${sys} mmHg pro Woche verändert und der diastolische um ${dia} mmHg pro Woche (Anpassungsgüte r² = ${fit}). Einzelmessungen streuen stark; bei kleinem r² ist die Trendlinie keine Vorhersage.`,
    footerNote:
      'Die Messungen wurden zu Hause mit einem persönlichen Messgerät durchgeführt und in Heart History erfasst. Zu Hause gemessene Werte liegen meist etwas unter denen in der Praxis. Dieser Bericht ist eine Aufzeichnung von Messwerten, keine Diagnose.',
    generated: (date: string) => `Erstellt am ${date} · Heart History`,
  },
};

export type Dictionary = typeof de;
