import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import type { CreateSupportMessageDto } from './dto/create-support-message.dto';

const RATE_LIMIT_WINDOW_MS = 60 * 60_000;
const RATE_LIMIT_MAX = 5;

@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);
  private readonly attempts = new Map<string, number[]>();
  private transporter: Transporter | null = null;

  async send(
    message: CreateSupportMessageDto,
    source: { ip: string; userAgent?: string },
  ): Promise<{ accepted: true }> {
    if (message.website) return { accepted: true };
    this.assertRateLimit(source.ip);

    const transporter = this.mailTransporter();
    const from = this.requiredEnvironmentValue('MAIL_FROM');
    const to = this.requiredEnvironmentValue('CONTACT_TO');
    const category = categoryLabel(message.category);
    const result = await transporter
      .sendMail({
        from: { name: 'Chess Sagas Support', address: from },
        to,
        replyTo: { name: message.name, address: message.email },
        subject: `[Chess Sagas ${category}] ${message.subject}`,
        text: [
          `Category: ${category}`,
          `From: ${message.name} <${message.email}>`,
          `Source IP: ${source.ip}`,
          `User agent: ${source.userAgent ?? 'Not provided'}`,
          '',
          message.message,
        ].join('\n'),
      })
      .catch((error: unknown) => {
        this.logger.error(
          `Support email delivery failed: ${error instanceof Error ? error.message : 'Unknown SMTP error'}`,
        );
        throw new ServiceUnavailableException(
          'Support email could not be delivered',
        );
      });
    this.logger.log(`Support message accepted messageId=${result.messageId}`);
    return { accepted: true };
  }

  private mailTransporter(): Transporter {
    if (this.transporter) return this.transporter;
    const host = this.requiredEnvironmentValue('SMTP2GO_HOST');
    const user = this.requiredEnvironmentValue('SMTP2GO_USER');
    const pass = this.requiredEnvironmentValue('SMTP2GO_PASSWORD');
    const port = Number(process.env.SMTP2GO_PORT ?? 2525);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new ServiceUnavailableException('Support email is not configured');
    }
    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
    return this.transporter;
  }

  private requiredEnvironmentValue(name: string): string {
    const value = process.env[name]?.trim();
    if (!value) {
      this.logger.error(`Missing support email configuration: ${name}`);
      throw new ServiceUnavailableException('Support email is not configured');
    }
    return value;
  }

  private assertRateLimit(ip: string): void {
    const now = Date.now();
    const recent = (this.attempts.get(ip) ?? []).filter(
      (timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS,
    );
    if (recent.length >= RATE_LIMIT_MAX) {
      throw new HttpException(
        'Too many support messages. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    recent.push(now);
    this.attempts.set(ip, recent);
  }
}

function categoryLabel(category: CreateSupportMessageDto['category']): string {
  return {
    bug: 'Bug Report',
    suggestion: 'Suggestion',
    billing: 'Billing',
    account: 'Account',
    other: 'General',
  }[category];
}
