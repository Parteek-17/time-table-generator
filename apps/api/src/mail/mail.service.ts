import { Inject, Injectable, Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { ENV, type Env } from '../config/env';

export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * Sends email over SMTP: Mailpit in dev, Resend's SMTP endpoint in production
 * (docs/adr/0004-email-over-smtp.md). Tests replace this provider.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transport: Transporter;
  private readonly from: string;

  constructor(@Inject(ENV) env: Env) {
    this.transport = createTransport(env.EMAIL_SERVER);
    this.from = env.EMAIL_FROM;
  }

  /** Returns false instead of throwing, so a mail outage never loses the invite itself. */
  async send(mail: OutgoingMail): Promise<boolean> {
    try {
      await this.transport.sendMail({ from: this.from, ...mail });
      return true;
    } catch (error) {
      this.logger.error(`Could not send "${mail.subject}" to ${mail.to}`, error as Error);
      return false;
    }
  }
}
