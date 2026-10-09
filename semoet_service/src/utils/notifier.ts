import { logger } from '../config/logger.js';
import { isProduction } from '../config/env.js';

/**
 * Integration point untuk kanal komunikasi.
 *
 * Pada proyek nyata, implementasi di sini memanggil provider SMS/email/FCM
 * (Twilio, SendGrid, FCM Admin SDK, dll). Default: log di server supaya alur
 * tetap bisa diuji end-to-end tanpa kredensial eksternal.
 *
 * Penting: kode OTP TIDAK PERNAH masuk ke response API maupun log di production.
 */

export interface SmsMessage {
  to: string;
  body: string;
}

export interface EmailMessage {
  to: string;
  subject: string;
  body: string;
}

export interface PushMessage {
  userId: string;
  title: string;
  body: string;
  actionUrl?: string;
}

export async function sendSms(message: SmsMessage): Promise<void> {
  if (isProduction) {
    // TODO: integrasikan provider SMS (contoh: https://api.twilio.com/...)
    logger.error({ channel: 'sms' }, '[notifier] SMS provider belum dikonfigurasi');
    return;
  }
  logger.warn({ to: message.to, body: message.body }, '[notifier:dev] SMS simulasi');
}

export async function sendEmail(message: EmailMessage): Promise<void> {
  if (isProduction) {
    // TODO: integrasikan provider email (contoh: Nodemailer / SendGrid)
    logger.error({ channel: 'email', to: message.to }, '[notifier] Email provider belum dikonfigurasi');
    return;
  }
  logger.warn({ to: message.to, subject: message.subject }, '[notifier:dev] Email simulasi');
}

export async function sendPush(message: PushMessage): Promise<void> {
  if (isProduction) {
    // TODO: integrasikan FCM / APNs via notification.repository.findDevicesForUsers
    logger.info({ userId: message.userId }, '[notifier] Push terkirim (queued)');
    return;
  }
  logger.info({ userId: message.userId, title: message.title }, '[notifier:dev] Push simulasi');
}

/**
 * OTP hanya ditampilkan di log pada mode development supaya QA bisa login
 * tanpa layanan SMS. Di production fungsi ini tidak melakukan apa pun.
 */
export function logOtpForDevelopment(phoneE164: string, code: string, purpose: string): void {
  if (isProduction) return;
  logger.warn({ phoneE164, purpose, code }, '[notifier:dev] OTP untuk pengujian');
}