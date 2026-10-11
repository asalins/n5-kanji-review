/** Our own wording of the acknowledgement required by the EDRDG licence (checked against the official page). */
export const ABOUT_TEXT = {
  title: 'เกี่ยวกับและแหล่งข้อมูล · About & Sources',
  backToSettings: '← ตั้งค่า · Settings',
  app: 'N5 Kanji Review: แอปทบทวนคันจิระดับเริ่มต้นด้วยแฟลชการ์ดและการทบทวนแบบเว้นระยะ · Kanji flashcards with spaced repetition.',
  kanjiDataTitle: 'ข้อมูลคันจิ · Kanji data',
  kanjiData:
    'ข้อมูลคันจิ (ความหมายภาษาอังกฤษ, การอ่าน, จำนวนขีด, ความถี่) มาจากไฟล์ KANJIDIC2 ของ Electronic Dictionary Research and Development Group (EDRDG) · This app uses the KANJIDIC2 dictionary file of the Electronic Dictionary Research and Development Group (EDRDG).',
  copyright:
    'ไฟล์ KANJIDIC2 เป็นลิขสิทธิ์ของ James William Breen และ EDRDG และเผยแพร่ภายใต้สัญญาอนุญาต Creative Commons Attribution-ShareAlike 4.0 (CC BY-SA 4.0) · KANJIDIC2 is copyright James William Breen and the EDRDG, used under CC BY-SA 4.0.',
  derived:
    'ข้อมูลคันจิในแอปนี้ (n5.json) ถูกคัดเลือกและแปลงรูปแบบจาก KANJIDIC2 จึงเผยแพร่ภายใต้ CC BY-SA 4.0 เช่นกัน · The kanji data in this app (n5.json) is selected and transformed from KANJIDIC2 and is shared under the same CC BY-SA 4.0 licence.',
  noClaim:
    'โปรเจกต์นี้ไม่อ้างลิขสิทธิ์ในข้อมูลดังกล่าว และไม่ได้รับการรับรองจาก EDRDG · This project claims no copyright over that data and is not endorsed by the EDRDG.',
  datasetVersion: 'เวอร์ชันชุดข้อมูลในแอป · Dataset version',
  datasetVersionUnknown: 'ไม่ทราบ · unknown',
  fontsTitle: 'ฟอนต์ญี่ปุ่น · Japanese fonts',
  fonts:
    'คันจิแสดงด้วยฟอนต์ Klee One, Noto Sans JP, Noto Serif JP, Yuji Syuku (SIL Open Font License 1.1) และ Kosugi Maru (Apache License 2.0) ตัดให้เหลือเฉพาะตัวอักษรที่แอปใช้ · Kanji are shown with Klee One, Noto Sans JP, Noto Serif JP, Yuji Syuku (SIL OFL 1.1) and Kosugi Maru (Apache 2.0), subset to the characters this app uses.',
  fontsLicences: 'สัญญาอนุญาตของฟอนต์ · Font licences',
  storageTitle: 'การเก็บข้อมูลในเครื่อง · Storage on this device',
  storageNote:
    'ความคืบหน้าเก็บไว้ในเบราว์เซอร์นี้เท่านั้น ไม่มีบัญชีผู้ใช้ ใช้ Export backup ในหน้าตั้งค่าเพื่อย้ายไปเครื่องอื่น · Progress is stored only in this browser (no account); use Export backup in Settings to move it.',
  storageStatus: 'สถานะ · Status',
  storagePersistent: 'ถาวร: เบราว์เซอร์จะไม่ลบเอง · Persistent',
  storageNotPersistent: 'ไม่ถาวร: เบราว์เซอร์อาจลบเมื่อพื้นที่เหลือน้อย แนะนำติดตั้งลงหน้าจอโฮมและ Export backup · Not persistent',
  storageUnsupported: 'เบราว์เซอร์นี้ไม่รองรับ · Not supported by this browser',
  linksTitle: 'ลิงก์ (ต้องใช้อินเทอร์เน็ต) · Links (need internet)',
  linkLicence: 'สัญญาอนุญาตของ EDRDG · EDRDG licence statement',
  linkProject: 'โครงการ KANJIDIC · KANJIDIC Project',
  linkCc: 'Creative Commons BY-SA 4.0',
  listTitle: 'รายการคันจิ N5 · Kanji list',
  list:
    'รายการคันจิ N5 จำนวน 196 ตัวเป็นหลักสูตรที่โปรเจกต์กำหนดเอง ไม่ใช่รายการทางการของการสอบ JLPT · The 196-kanji N5 list is a project-defined curriculum, not an official JLPT list.',
  thaiTitle: 'ความหมายภาษาไทย · Thai meanings',
  thai: 'ความหมายภาษาไทยจัดทำโดยโปรเจกต์ และแสดงเฉพาะรายการที่ผ่านการตรวจโดยคนแล้ว · Thai meanings are written by this project and shown only after human review.',
  jmdict: 'แอปนี้ไม่ได้ใช้ข้อมูลจาก JMdict · This app does not use JMdict data.',
} as const;

export const ABOUT_LINKS = {
  licence: 'https://www.edrdg.org/edrdg/license.html',
  project: 'https://www.edrdg.org/wiki/index.php/KANJIDIC_Project',
  cc: 'https://creativecommons.org/licenses/by-sa/4.0/',
  fontKlee: '/licenses/fonts/KleeOne-OFL.txt',
  fontNotoSans: '/licenses/fonts/NotoSansJP-OFL.txt',
  fontNotoSerif: '/licenses/fonts/NotoSerifJP-OFL.txt',
  fontYuji: '/licenses/fonts/YujiSyuku-OFL.txt',
  fontKosugi: '/licenses/fonts/KosugiMaru-Apache-2.0.txt',
} as const;
