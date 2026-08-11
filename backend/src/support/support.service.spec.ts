import nodemailer from 'nodemailer';
import { SupportService } from './support.service';

jest.mock('nodemailer', () => ({
  __esModule: true,
  default: { createTransport: jest.fn() },
}));

describe('SupportService', () => {
  const sendMail = jest.fn();
  let service: SupportService;

  beforeEach(() => {
    process.env.SMTP2GO_HOST = 'mail.smtp2go.com';
    process.env.SMTP2GO_PORT = '2525';
    process.env.SMTP2GO_USER = 'support-user';
    process.env.SMTP2GO_PASSWORD = 'support-password';
    process.env.MAIL_FROM = 'support@example.com';
    process.env.CONTACT_TO = 'owner@example.com';
    sendMail.mockReset().mockResolvedValue({ messageId: 'message-1' });
    jest.mocked(nodemailer.createTransport).mockReturnValue({
      sendMail,
    } as never);
    service = new SupportService();
  });

  afterEach(() => {
    delete process.env.SMTP2GO_HOST;
    delete process.env.SMTP2GO_PORT;
    delete process.env.SMTP2GO_USER;
    delete process.env.SMTP2GO_PASSWORD;
    delete process.env.MAIL_FROM;
    delete process.env.CONTACT_TO;
  });

  it('delivers a categorized plain-text message with reply-to metadata', async () => {
    await expect(
      service.send(
        {
          category: 'bug',
          name: 'Reader One',
          email: 'reader@example.com',
          subject: 'The board stopped moving',
          message: 'The Advance button stopped responding on my phone.',
          website: '',
        },
        { ip: '203.0.113.1', userAgent: 'Test browser' },
      ),
    ).resolves.toEqual({ accepted: true });

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'owner@example.com',
        replyTo: { name: 'Reader One', address: 'reader@example.com' },
        subject: '[Chess Sagas Bug Report] The board stopped moving',
        text: expect.stringContaining('The Advance button stopped responding'),
      }),
    );
  });

  it('silently accepts honeypot submissions without sending mail', async () => {
    await service.send(
      {
        category: 'other',
        name: 'Automated Sender',
        email: 'bot@example.com',
        subject: 'Automated message',
        message: 'This should not reach the support inbox.',
        website: 'https://spam.example',
      },
      { ip: '203.0.113.2' },
    );

    expect(sendMail).not.toHaveBeenCalled();
  });

  it('limits one source to five messages per hour', async () => {
    const message = {
      category: 'suggestion' as const,
      name: 'Reader One',
      email: 'reader@example.com',
      subject: 'A useful suggestion',
      message: 'Please add another battlefield environment someday.',
      website: '',
    };
    for (let index = 0; index < 5; index += 1) {
      await service.send(message, { ip: '203.0.113.3' });
    }

    await expect(
      service.send(message, { ip: '203.0.113.3' }),
    ).rejects.toMatchObject({ status: 429 });
  });
});
