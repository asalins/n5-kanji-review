import { SECONDARY_BUTTON } from '../../components/styles';

/**
 * L0 only (branch `login-spike`, never merged): a full-page link to the separate spike page, so the
 * installed PWA can open it. It loads nothing itself; the Firebase SDK exists only in the spike page's bundle.
 */
export function LoginSpikeLink() {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-dashed border-amber-500 bg-amber-50 p-4 text-left dark:bg-amber-950/30">
      <h2 className="text-lg font-semibold">ทดลองล็อกอิน (L0 Spike)</h2>
      <p className="text-sm">เฉพาะเวอร์ชันทดลอง · ไม่ sync และไม่เปลี่ยนข้อมูลการเรียน</p>
      <a href="/login-spike" className={`${SECONDARY_BUTTON} flex items-center justify-center`} data-testid="login-spike-link">
        เปิดหน้าทดลองล็อกอิน
      </a>
    </section>
  );
}
