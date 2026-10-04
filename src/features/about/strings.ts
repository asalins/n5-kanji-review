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
} as const;
