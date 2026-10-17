import { PRIVACY_CONTACT_EMAIL } from '../../services/account';

export const ACCOUNT_TEXT = {
  title: 'บัญชี · Account',
  optional: 'ไม่บังคับ: ใช้แอปได้ครบโดยไม่ต้องเข้าสู่ระบบ ถ้าเข้าสู่ระบบ จะ sync ความคืบหน้าการเรียนระหว่างอุปกรณ์ของคุณได้ (ถามก่อนอัปโหลด) · Optional: the app works fully without an account. Signed in, your learning progress can be synced between your devices (you are asked before anything is uploaded).',
  readPrivacy: 'อ่านความเป็นส่วนตัวก่อนเข้าสู่ระบบ · Read the privacy notice before signing in',
  privacy: 'ความเป็นส่วนตัว · Privacy',
  signIn: 'เข้าสู่ระบบด้วย Google · Sign in with Google',
  checking: 'กำลังตรวจสถานะบัญชี… · Checking the account…',
  checkingOffline: 'ออฟไลน์ · ตรวจสถานะบัญชีไม่ได้ จะตรวจอีกครั้งเมื่อออนไลน์ · Offline: the account will be checked when you are back online.',
  signedInAs: 'เข้าสู่ระบบเป็น · Signed in as',
  offlineSignedIn: 'ออฟไลน์ · ยังเข้าสู่ระบบอยู่ ตรวจกับเซิร์ฟเวอร์ไม่ได้ · Offline: still signed in, not checked with the server.',
  accountInvalid: 'บัญชีหมดอายุหรือถูกลบ · เข้าสู่ระบบใหม่ได้ · The account expired or was deleted. You can sign in again.',
  signOut: 'ออกจากระบบบนอุปกรณ์นี้ · Sign out on this device',
  signOutScope: 'มีผลกับทุกแท็บและแอปที่ติดตั้งบนอุปกรณ์นี้ ไม่มีผลกับอุปกรณ์อื่น · Applies to every tab and the installed app on this device, not to other devices.',
  signOutConfirm: 'ออกจากระบบ · Sign out',
  deleteAccount: 'ลบบัญชี · Delete account',
  deleteConfirm: 'ยืนยันตัวตนและลบบัญชี · Verify and delete',
  deleteExplain:
    'ระบบจะขอให้ยืนยันตัวตนกับ Google อีกครั้ง แล้วลบข้อมูลการเรียนของบัญชีนี้บน Cloud ก่อน (ถ้าลบไม่สำเร็จ จะหยุดและยังไม่ลบบัญชี) จากนั้นจึงลบบัญชี อุปกรณ์อื่นจะหยุด sync ข้อมูลการเรียนในเครื่องนี้จะยังอยู่ เว้นแต่คุณเลือกลบ · You will verify with Google again. The learning data of this account in the cloud is deleted first (if that fails, everything stops and the account is kept); then the account is deleted. Other devices stop syncing. Learning data on this device stays unless you choose to delete it.',
  understand: 'ฉันเข้าใจ · I understand',
  cancel: 'ยกเลิก · Cancel',
  deleteLocal: 'ลบความคืบหน้าการเรียนในเครื่องนี้ด้วย · Also delete learning progress on this device',
  sharedDevice: 'ถ้าใช้เครื่องนี้ร่วมกับคนอื่น ข้อมูลการเรียนจะยังอยู่ในเครื่องหลังออกจากระบบ · On a shared device your learning data stays on it after signing out.',
  busy: 'กำลังดำเนินการ… · Working…',
  signInCancelled: '',
  signInBlocked: 'เบราว์เซอร์บล็อกหน้าต่าง Google · กดอีกครั้ง หรืออนุญาต pop-up · The browser blocked the Google window. Tap again or allow pop-ups.',
  signInNetwork: 'ออฟไลน์หรือเชื่อมต่อไม่ได้ · ลองใหม่เมื่อออนไลน์ · Offline or no connection. Try again when online.',
  signInFailed: 'เข้าสู่ระบบไม่สำเร็จ · ลองใหม่อีกครั้ง · Sign-in failed. Please try again.',
  signedOut: 'ออกจากระบบแล้ว · Signed out.',
  signOutFailed: 'ออกจากระบบไม่สำเร็จ · ยังเข้าสู่ระบบอยู่ · Sign-out failed; you are still signed in.',
  localKept: 'ข้อมูลการเรียนในเครื่องยังอยู่ · Learning data on this device is kept.',
  localDeleted: 'ลบความคืบหน้าการเรียนในเครื่องแล้ว · Learning progress on this device was deleted.',
  localFailed: 'ลบข้อมูลในเครื่องไม่สำเร็จ · ข้อมูลยังอยู่ · Deleting the data on this device failed; it is still there.',
  retryLocal: 'ลองลบข้อมูลในเครื่องอีกครั้ง · Try deleting the data on this device again',
  accountDeleted: 'ลบบัญชีแล้ว · The account was deleted.',
  noCloudData: 'แอปยังไม่ได้เก็บข้อมูลการเรียนบน Cloud · The app stored no learning data in the cloud.',
  cloudDeleted: 'ลบข้อมูลการเรียนบน Cloud แล้ว · The learning data in the cloud was deleted.',
  accountFailedAfterCloud:
    'แต่ลบบัญชีไม่สำเร็จ · บัญชียังอยู่ ข้อมูลในเครื่องไม่ถูกแตะ ลองลบบัญชีอีกครั้งได้ · But deleting the account failed: the account still exists and nothing on this device was touched. You can try again.',
  cloudFailed:
    'ลบข้อมูลการเรียนบน Cloud ไม่สำเร็จ (บางส่วนอาจถูกลบไปแล้ว) · ยังไม่ได้ลบบัญชี ข้อมูลในเครื่องไม่ถูกแตะ ลองใหม่ได้ · Deleting the learning data in the cloud failed (part of it may already be deleted). The account was NOT deleted and nothing on this device was touched. You can try again.',
  deleteCancelled: 'ยังไม่ได้ลบบัญชี (ยกเลิกการยืนยันตัวตน) · The account was not deleted (verification cancelled).',
  deleteFailed: 'ลบบัญชีไม่สำเร็จ · ไม่มีข้อมูลใดถูกลบ ลองใหม่ได้ · Deleting the account failed; nothing was deleted. You can try again.',
  deleteNetwork: 'ออฟไลน์หรือเชื่อมต่อไม่ได้ · ยังไม่ได้ลบบัญชี · Offline or no connection; the account was not deleted.',
} as const;

/** L3b sync panel (Settings → Account, signed in). */
export const SYNC_TEXT = {
  title: 'Sync ระหว่างอุปกรณ์ · Sync between devices',
  syncing: 'กำลัง sync… · Syncing…',
  synced: 'Sync ล่าสุด · Last synced',
  never: 'ยังไม่เคย sync · Not synced yet',
  waiting: 'รอการยืนยันบัญชีกับเซิร์ฟเวอร์ · Waiting for the server to confirm the account',
  offline: 'ออฟไลน์ · จะ sync เมื่อออนไลน์ ใช้แอปได้ตามปกติ · Offline: syncs when you are back online. Study as usual.',
  quota: 'Sync หยุดชั่วคราว (เกินโควตาของบริการ) · ข้อมูลในเครื่องไม่ได้รับผลกระทบ จะลองใหม่เวลา · Sync is paused (service quota reached). Data on this device is not affected. Next try at',
  error: 'Sync ไม่สำเร็จ · จะลองใหม่อัตโนมัติเวลา · Sync failed; it retries automatically at',
  syncNow: 'Sync ตอนนี้ · Sync now',
  bindTitle: 'อัปโหลดความคืบหน้าในเครื่องนี้เข้าบัญชี? · Upload this device’s progress to the account?',
  bindExplain:
    'เครื่องนี้มีความคืบหน้าการเรียนที่ยังไม่ได้อยู่ในบัญชี ถ้าอัปโหลด จะรวมกับข้อมูลจากอุปกรณ์อื่นของบัญชีนี้ (ไม่มีรายการใดหาย) · This device has learning progress that is not in the account. Uploading merges it with your other devices of this account (nothing is lost).',
  bindUpload: 'อัปโหลดและ sync · Upload and sync',
  otherTitle: 'ความคืบหน้าในเครื่องนี้เป็นของบัญชีอื่น · This device’s progress belongs to another account',
  otherExplain:
    'จะไม่อัปโหลดความคืบหน้าของบัญชีอื่นเข้าบัญชีนี้ เลือกได้ว่าจะไม่ sync เครื่องนี้ หรือลบความคืบหน้าในเครื่องนี้แล้วใช้ข้อมูลของบัญชีนี้ · Progress of another account is never uploaded into this one. Either do not sync this device, or delete this device’s progress and use this account’s data.',
  replaceLocal: 'ลบความคืบหน้าในเครื่องนี้ แล้วใช้ข้อมูลของบัญชีนี้ · Delete this device’s progress and use the account’s data',
  replaceLocalExplain:
    'ความคืบหน้าการเรียนในเครื่องนี้ (การ์ด ประวัติการทบทวน และ session) จะถูกลบ แล้วดึงข้อมูลของบัญชีลงมา Export backup ก่อนได้ที่หัวข้อ Backup · This device’s learning progress (cards, review history, sessions) is deleted, then the account’s data is downloaded. You can export a backup first (Backup section).',
  skip: 'ไม่ sync เครื่องนี้ · Do not sync this device',
  declined: 'ไม่ sync เครื่องนี้กับบัญชีนี้ · This device is not synced with this account.',
  enable: 'เปิด sync เครื่องนี้ · Turn on sync for this device',
  resetTitle: 'ความคืบหน้าในบัญชีถูก reset หรือแทนที่จากอุปกรณ์อื่น · The account’s progress was reset or replaced from another device',
  resetWhen: 'เมื่อ · At',
  resetUnknownWhen: 'ข้อมูลบน Cloud ถูก reset หรือถูกลบ · The cloud data was reset or deleted.',
  resetUnsynced: 'รายการในเครื่องนี้ที่ยังไม่ได้ sync (จะไม่ถูกอัปโหลด) · Reviews on this device not yet synced (they will NOT be uploaded):',
  resetExplain:
    'Sync หยุดไว้จนกว่าคุณจะเลือก ถ้าต้องการเก็บข้อมูลของเครื่องนี้ ให้ Export backup ก่อน (หัวข้อ Backup) · Sync is stopped until you decide. To keep this device’s data, export a backup first (Backup section).',
  resetAccept: 'ล้างความคืบหน้าในเครื่องนี้และใช้ข้อมูลของบัญชี · Clear this device’s progress and use the account’s data',
  resetAcceptExplain: 'ความคืบหน้าการเรียนในเครื่องนี้จะถูกลบ แล้วใช้ข้อมูลปัจจุบันของบัญชี · This device’s learning progress is deleted and the account’s current data is used.',
  understand: 'ฉันเข้าใจ · I understand',
  cancel: 'ยกเลิก · Cancel',
  failed: 'ทำไม่สำเร็จ · ลองใหม่อีกครั้ง · That did not work. Please try again.',
  logTitle: 'บันทึก sync ของเครื่องนี้ (สำหรับตรวจสอบ) · Sync log of this device (for checking)',
  logNote: 'เก็บเฉพาะในเครื่องนี้ ไม่ถูกส่งไปที่ใด ไม่มีอีเมลหรือข้อมูลการทบทวน · Kept on this device only; never sent anywhere; no e-mail or review data.',
  logEmpty: 'ยังไม่มีรายการ · No entries yet',
} as const;

export const PRIVACY_LINKS = {
  google: 'https://policies.google.com/privacy',
  firebase: 'https://firebase.google.com/support/privacy',
} as const;

/** C3: what is stored, why, for how long, what deletion does, and what the app cannot promise. */
export const PRIVACY_TEXT = {
  title: 'ความเป็นส่วนตัว · Privacy',
  back: 'กลับ · Back',
  th: {
    heading: 'ภาษาไทย',
    sections: [
      ['ไม่ต้องมีบัญชี', 'การเข้าสู่ระบบเป็นทางเลือก ใช้แอปได้ครบโดยไม่มีบัญชี ข้อมูลการเรียนเก็บในเครื่องของคุณเสมอ ถ้าเข้าสู่ระบบและตกลง sync สำเนาของข้อมูลการเรียนจะถูกเก็บบน Cloud ด้วย แอปจะถามก่อนอัปโหลดความคืบหน้าที่มีอยู่ในเครื่อง'],
      ['เก็บอะไร', 'บัญชี: เมื่อเข้าสู่ระบบด้วย Google บริการ Firebase Authentication ของ Google จะเก็บรหัสผู้ใช้ (uid), อีเมล, ชื่อและรูปโปรไฟล์ตามที่ Google ส่งมา และเวลาที่สร้างบัญชีและเข้าสู่ระบบล่าสุด แอปแสดงเฉพาะอีเมล ข้อมูลการเรียน (เมื่อ sync): Cloud Firestore ของ Google เก็บภายใต้บัญชีของคุณ ได้แก่ ประวัติการทบทวนแต่ละครั้ง (การ์ดที่ทบทวน, ปุ่มที่กด, เวลา, เวลาที่ใช้ตอบ, สถานะก่อนและหลัง, เวอร์ชันชุดข้อมูล และรหัสอุปกรณ์แบบสุ่มที่แอปสร้างขึ้นเอง ซึ่งไม่ผูกกับฮาร์ดแวร์) และการตั้งค่าของแอป การ์ดและสถิติคำนวณใหม่จากประวัตินี้ ไม่มี Analytics'],
      ['ใช้ทำอะไร', 'ใช้ระบุตัวคุณ และ sync ความคืบหน้าการเรียนระหว่างอุปกรณ์ของคุณเท่านั้น ไม่ใช้เพื่อโฆษณาและไม่ขายข้อมูล ผู้ใช้อื่นอ่านหรือเขียนข้อมูลของคุณไม่ได้ (บังคับด้วย Security Rules)'],
      ['เก็บนานเท่าไร', 'เก็บจนกว่าคุณจะลบบัญชีในแอป (ตั้งค่า → บัญชี → ลบบัญชี) หรือขอให้ลบผ่านอีเมลด้านล่าง การออกจากระบบไม่ได้ลบบัญชีหรือข้อมูลบน Cloud การ Reset ความคืบหน้าหรือ Import (แทนที่) บนอุปกรณ์ที่ sync อยู่ จะแทนที่ข้อมูลการเรียนบน Cloud ด้วย'],
      ['การลบบัญชี', 'ลบข้อมูลการเรียนบน Cloud ก่อน ถ้าลบไม่สำเร็จจะหยุดและยังไม่ลบบัญชี จากนั้นลบบัญชีของแอปนี้ออกจาก Firebase Authentication ถ้าเข้าสู่ระบบอีกครั้งจะได้บัญชีใหม่ ข้อมูลการเรียนในเครื่องจะถูกลบเฉพาะเมื่อคุณเลือก การลบบัญชีในแอปไม่ได้ลบบัญชี Google ของคุณ'],
      ['สิ่งที่แอปรับรองไม่ได้', 'Google / Firebase อาจเก็บข้อมูลบางส่วนต่อตามนโยบายของตนเอง เช่น log และ backup ของระบบ ซึ่งอยู่นอกการควบคุมของแอป ตามที่ Firebase ระบุ ข้อมูล Authentication จะถูกลบออกจากระบบหลักและ backup ภายใน 180 วันหลังลบผู้ใช้ แอปรับรองได้เฉพาะสิ่งที่ระบบของแอปทำ'],
      ['ติดต่อ', `เรื่องความเป็นส่วนตัวหรือการลบบัญชี: ${PRIVACY_CONTACT_EMAIL}`],
    ],
  },
  en: {
    heading: 'English',
    sections: [
      ['No account needed', 'Signing in is optional; the app works fully without an account. Your learning data always stays on your device. If you sign in and agree to sync, a copy of your learning data is also stored in the cloud. The app asks before uploading progress that is already on a device.'],
      ['What is stored', "Account: when you sign in with Google, Google's Firebase Authentication stores your user id (uid), e-mail, the name and profile picture Google provides, and when the account was created and last used. The app shows only the e-mail. Learning data (when syncing): Google's Cloud Firestore stores, under your account, each review (which card, the button pressed, the time, how long the answer took, the state before and after, the dataset version, and a random device id created by the app, not tied to the hardware) and the app settings. Cards and statistics are recomputed from this history. No analytics."],
      ['Why', 'Only to identify you and to sync your learning progress between your devices. Never for advertising; never sold. Other users cannot read or write your data (enforced by Security Rules).'],
      ['How long', 'Until you delete the account in the app (Settings → Account → Delete account) or ask for deletion at the e-mail below. Signing out deletes neither the account nor the cloud data. Reset progress or Import (Replace) on a syncing device also replaces the learning data in the cloud.'],
      ['Deleting the account', 'First deletes your learning data in the cloud; if that fails, everything stops and the account is kept. Then removes this app’s account from Firebase Authentication; signing in again creates a new account. Learning data on your device is deleted only if you choose so. Deleting the account here does not delete your Google account.'],
      ['What the app cannot promise', 'Google / Firebase may keep some data under their own policies, such as system logs and backups, outside the app’s control. Firebase states that Authentication data is removed from live and backup systems within 180 days after the user is deleted. The app can only vouch for what its own system does.'],
      ['Contact', `Privacy or account deletion: ${PRIVACY_CONTACT_EMAIL}`],
    ],
  },
  links: 'นโยบายของผู้ให้บริการ · Provider policies',
  googleLink: 'นโยบายความเป็นส่วนตัวของ Google · Google Privacy Policy',
  firebaseLink: 'ความเป็นส่วนตัวและความปลอดภัยใน Firebase · Privacy and Security in Firebase',
} as const;
