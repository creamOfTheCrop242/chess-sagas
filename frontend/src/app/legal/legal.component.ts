import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

type LegalPageKey = 'terms' | 'privacy' | 'refunds';

interface LegalSection {
  id?: string;
  heading: string;
  paragraphs: string[];
  bullets?: string[];
}

interface LegalPage {
  eyebrow: string;
  title: string;
  introduction: string;
  notice?: string;
  sections: LegalSection[];
}

const EFFECTIVE_DATE = 'September 4, 2026';
const OPERATOR_NAME = 'Cream of the Crop LLC';
const OPERATOR_ADDRESS = '121 Thornhill Ct, Dover, DE 19904, USA';

const PAGES: Record<LegalPageKey, LegalPage> = {
  terms: {
    eyebrow: 'Rules of the realm',
    title: 'Terms of Service',
    introduction:
      'These Terms govern your access to and use of Chess Sagas, including saga generation, public records, accounts, subscriptions, and saga credits. By using the service, you agree to these Terms.',
    notice:
      'Chess Sagas uses artificial intelligence. Generated sagas may be inaccurate, inconsistent, incomplete, or offensive. Every newly generated saga is publicly visible by default.',
    sections: [
      {
        heading: 'Service operator',
        paragraphs: [
          `Chess Sagas is operated by ${OPERATOR_NAME}, a Delaware limited liability company. Our mailing address is ${OPERATOR_ADDRESS}. In these Terms, “Chess Sagas,” “we,” “us,” and “our” refer to ${OPERATOR_NAME}.`,
        ],
      },
      {
        heading: 'Who may use Chess Sagas',
        paragraphs: [
          'You must be at least 13 years old to use Chess Sagas. If you are under the age of legal majority where you live, you may use the service only with permission from a parent or legal guardian who agrees to these Terms on your behalf. You must also be legally able to enter into this agreement. If you use Chess Sagas for an organization, you represent that you have authority to bind that organization.',
          'The service contains fictional battlefield violence, including descriptions of fantasy injuries and deaths, and may not be suitable for every audience.',
        ],
      },
      {
        heading: 'Accounts and authentication',
        paragraphs: [
          'You may sign in through supported third-party identity providers. You are responsible for protecting access to your account and for activity performed through it. Tell us promptly if you believe your account has been compromised.',
          'Your account is personal to you. Do not sell, share, or transfer it in a way that bypasses credit limits, subscriptions, or other service controls.',
        ],
      },
      {
        heading: 'AI-generated content and accuracy',
        paragraphs: [
          'Saga text, titles, character histories, injuries, relationships, locations, and conclusions may be produced or assisted by artificial intelligence. Automated chess-ledger checks and repair steps reduce errors but cannot eliminate them.',
          'Do not rely on a saga as a factual chess record, historical account, professional opinion, or statement about a real person. You are responsible for reviewing generated material before sharing or relying on it.',
        ],
      },
      {
        heading: 'Public sagas and your submissions',
        paragraphs: [
          'New sagas are PUBLIC BY DEFAULT and may appear in the Hall of Records, public creator profiles, search results, links, and other public parts of Chess Sagas. Anyone may be able to read and replay them.',
          'Do not submit private, confidential, unlawful, or sensitive personal information in a PGN or its headers. You represent that you have the rights and permissions needed to submit the material you provide.',
          'You retain any rights you have in your submissions. You grant Chess Sagas a worldwide, non-exclusive, royalty-free license to host, process, reproduce, display, distribute, and adapt those submissions as needed to operate, improve, secure, and promote the service and its public saga archive.',
        ],
      },
      {
        heading: 'Saga credits, reuse, retries, and failures',
        paragraphs: [
          'One credit is required to create one new saga. Starting generation reserves one credit. The credit is consumed only after the saga is successfully completed and saved.',
        ],
        bullets: [
          'Automatic generation, correction, and validation retries within the same job do not consume additional credits.',
          'If generation ends in a terminal failure, the reservation is released and the credit returns to your available balance. A returned credit is not a cash refund.',
          'If you manually retry after a terminal failure, a credit may be reserved again, but it is consumed only if that generation succeeds.',
          'Opening or replaying an existing completed saga is free. If an identical completed saga can be reused, no new credit is consumed and the existing saga may be shown instead of generating another copy.',
          'Credits currently do not expire. Unused one-time and subscription credits remain on the account and roll over from month to month unless a future offer clearly states otherwise. We will give reasonable notice before materially changing existing credit expiration rules.',
        ],
      },
      {
        heading: 'Subscriptions and payments',
        paragraphs: [
          'Prices and included credits are shown before checkout. Stripe processes checkout and payment information. Subscription credits are granted after each successful recurring payment. Subscriptions renew automatically until canceled.',
          'You may manage or cancel a subscription through the billing portal. Cancellation normally takes effect at the end of the current paid billing period. Canceling stops future renewals and future monthly credit grants; credits already granted remain available under the credit rules above.',
          'Refunds and failed-payment handling are governed by the Refund and Cancellation Policy, which is incorporated into these Terms.',
        ],
      },
      {
        heading: 'Acceptable use',
        paragraphs: ['You may not:'],
        bullets: [
          'break the law, infringe another person’s rights, or submit personal information without authorization;',
          'probe, disrupt, overload, scrape, reverse engineer, or bypass security, billing, rate limits, or access controls;',
          'use automation to create accounts, obtain promotional credits, or generate sagas abusively;',
          'impersonate another person or falsely suggest endorsement; or',
          'use the service to distribute malware, harassment, threats, exploitation, or other harmful material.',
        ],
      },
      {
        heading: 'Service changes and availability',
        paragraphs: [
          'AI providers, hosting services, databases, payment systems, and network conditions may affect availability and generation time. We may change, suspend, limit, or discontinue features, and we may remove content or restrict accounts to protect users, the service, or legal compliance.',
          'We do not promise that every generation will succeed, finish within a particular time, or remain available forever. Keep copies of material you cannot afford to lose.',
        ],
      },
      {
        heading: 'Intellectual property',
        paragraphs: [
          'Chess Sagas and its original software, visual design, world lore, names, templates, and branding belong to Chess Sagas or its licensors. Subject to these Terms, you may use your generated saga for lawful personal or commercial purposes to the extent applicable law permits. Because AI output may not qualify for copyright protection and similar output may be generated for others, exclusivity is not promised.',
        ],
      },
      {
        heading: 'Disclaimers and limits',
        paragraphs: [
          'THE SERVICE IS PROVIDED “AS IS” AND “AS AVAILABLE.” TO THE MAXIMUM EXTENT PERMITTED BY LAW, CHESS SAGAS DISCLAIMS IMPLIED WARRANTIES, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, AND ACCURACY.',
          'TO THE MAXIMUM EXTENT PERMITTED BY LAW, CHESS SAGAS WILL NOT BE LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR FOR LOST PROFITS, DATA, GOODWILL, OR BUSINESS INTERRUPTION. NOTHING IN THESE TERMS EXCLUDES RIGHTS OR LIABILITY THAT CANNOT LAWFULLY BE EXCLUDED.',
        ],
      },
      {
        heading: 'Termination and deletion',
        paragraphs: [
          'You may stop using Chess Sagas or request account deletion at any time. We may suspend or terminate access for violations, fraud, security risks, nonpayment, or legal reasons. Account deletion instructions appear in the Privacy Policy.',
        ],
      },
      {
        heading: 'Changes and contact',
        paragraphs: [
          `These Terms are effective ${EFFECTIVE_DATE}. We may update them as the service or law changes. Material changes will be announced through the service or another reasonable method. Questions may be submitted through the Contact Support page, sent to don@creamofthecrop.tech, or mailed to ${OPERATOR_NAME}, ${OPERATOR_ADDRESS}.`,
        ],
      },
    ],
  },
  privacy: {
    eyebrow: 'Your records',
    title: 'Privacy Policy',
    introduction:
      'This Privacy Policy explains what Chess Sagas collects, why it is used, when it is shared, and how you can request access to or deletion of your information.',
    notice:
      'New sagas are publicly visible by default. PGN headers, player names, generated text, and the creator identity you choose to display may be seen by anyone.',
    sections: [
      {
        heading: 'Who operates Chess Sagas',
        paragraphs: [
          `${OPERATOR_NAME}, a Delaware limited liability company, operates Chess Sagas and is responsible for the personal information described in this policy. Our mailing address is ${OPERATOR_ADDRESS}.`,
        ],
      },
      {
        heading: 'Information we collect',
        paragraphs: ['Depending on how you use Chess Sagas, we collect:'],
        bullets: [
          'Account information from Google or Apple, such as provider identifier, verified email address, display name, and avatar.',
          'Profile information you choose to provide, including handle, display name, biography, avatar, and creator-credit preference.',
          'PGNs, chess metadata, generated sagas, bookmarks, page progress, character assignments, and other content or preferences connected with use of the service.',
          'Billing records such as Stripe customer, checkout, subscription, invoice, event, product, credit-ledger, and reservation identifiers. Chess Sagas does not receive or store your full card number.',
          'Technical and usage information such as session records, IP address, browser and device information, logs, errors, generation timing, AI token usage, and security events.',
          'Optional push-notification subscription information and support messages, including the name, email, category, subject, and message you submit.',
        ],
      },
      {
        heading: 'How we use information',
        paragraphs: ['We use information to:'],
        bullets: [
          'authenticate users and maintain accounts, profiles, bookmarks, and saga progress;',
          'parse games, generate and validate sagas, provide public records, and avoid charging for reusable completed work;',
          'process purchases, subscriptions, credits, refunds, failures, and abuse prevention;',
          'send requested service, push, support, account, billing, and security communications;',
          'measure reliability, cost, performance, and generation quality; troubleshoot failures; and improve the service;',
          'enforce our Terms, prevent fraud, protect users, and comply with legal obligations.',
        ],
      },
      {
        heading: 'AI processing',
        paragraphs: [
          'Information needed to generate a saga—including the PGN, game analysis, character data, prompts, and prior pipeline output—may be sent to third-party AI service providers. Those providers process the information to return narrative analysis, outlines, story text, corrections, or related output.',
          'Do not place secrets, confidential information, or sensitive personal information in a PGN or other submission. AI-generated material may contain errors or unexpected content.',
        ],
      },
      {
        heading: 'Public information',
        paragraphs: [
          'Sagas are public by default. Public saga data may include PGN headers, player names, moves, battle location, generated narrative, character details, and associated creator information. Public information can be copied, indexed, or reshared by others beyond our control.',
          'Turning off creator credit can remove your displayed identity from public saga listings, but it does not make the saga private or remove the underlying public record. Contact support if you need a public saga reviewed or removed.',
        ],
      },
      {
        heading: 'How information is shared',
        paragraphs: [
          'We share information only as needed to operate the service, at your direction, or for legal and safety reasons. Service providers may include hosting and database providers, Stripe for billing, Google and Apple for sign-in, AI providers for generation, email providers for support, and browser push-notification services.',
          'We may disclose information to comply with law, legal process, or valid government requests; enforce agreements; investigate fraud or abuse; protect rights and safety; or complete a merger, financing, acquisition, reorganization, or sale of assets subject to appropriate protections.',
          'We do not sell personal information for money and do not use it for cross-context behavioral advertising.',
        ],
      },
      {
        heading: 'Cookies and local storage',
        paragraphs: [
          'Chess Sagas uses session cookies and similar browser storage to keep you signed in, protect authentication flows, remember interface preferences, preserve saga reading progress, support PWA behavior, and maintain security. Blocking these technologies may prevent parts of the service from working.',
        ],
      },
      {
        heading: 'Retention',
        paragraphs: [
          'We retain account information while your account is active and as reasonably needed to provide the service. Public sagas may remain available until removed. Billing, fraud-prevention, tax, transaction, security, and legal records may be retained for the period required or permitted by law. Backups and provider systems may take additional time to cycle out deleted information.',
          'We aim to retain only information reasonably needed for the purposes described here, but exact periods vary by record type and legal obligation.',
        ],
      },
      {
        id: 'deletion',
        heading: 'Account and data deletion instructions',
        paragraphs: [
          'You can delete your account directly from My public profile after signing in. Type the displayed confirmation phrase and confirm the permanent deletion. Cancel any active subscription through Saga Credits first. If you cannot sign in, contact don@creamofthecrop.tech from the account email so we can verify your identity.',
          'Deleting an account permanently removes profile information, sessions, bookmarks, reading progress, unused credits, and access to purchases. Public saga records remain available but are de-identified and no longer link to your profile. Billing, fraud-prevention, tax, transaction, security, and legal records may be retained where required or permitted.',
        ],
      },
      {
        heading: 'Your choices and rights',
        paragraphs: [
          'You may update available profile settings, disable creator attribution, unsubscribe from optional push notifications through your browser, cancel subscriptions through the billing portal, and request access, correction, deletion, or a copy of eligible personal information through Contact Support. Applicable law may provide additional rights and appeal options.',
          'We may need to verify your request. Authorized agents must provide proof of authority. We will not discriminate against you for exercising applicable privacy rights.',
        ],
      },
      {
        heading: 'Security and international processing',
        paragraphs: [
          'We use administrative, technical, and organizational safeguards designed to protect information. No internet service is completely secure, and we cannot guarantee absolute security.',
          'Chess Sagas and its providers may process information in the United States and other countries whose data-protection rules differ from those where you live.',
        ],
      },
      {
        heading: 'Children',
        paragraphs: [
          'Chess Sagas is intended for users age 13 and older. We do not knowingly collect personal information from children under 13. If you believe a child under 13 has provided personal information, contact us so we can investigate and delete it as appropriate. Users under the age of legal majority where they live should use Chess Sagas only with permission from a parent or legal guardian.',
        ],
      },
      {
        heading: 'Changes and contact',
        paragraphs: [
          `This policy is effective ${EFFECTIVE_DATE}. We may update it as practices or law change. Material changes will be announced through the service or another reasonable method. Privacy questions and requests may be submitted through Contact Support, sent to don@creamofthecrop.tech, or mailed to ${OPERATOR_NAME}, ${OPERATOR_ADDRESS}.`,
        ],
      },
    ],
  },
  refunds: {
    eyebrow: 'Billing terms',
    title: 'Refund and Cancellation Policy',
    introduction:
      'This policy explains how one-time saga credits, subscriptions, failed generations, cancellations, and refunds work.',
    notice:
      'A failed saga generation returns the reserved credit after terminal failure. That credit return is automatic and is separate from a refund of money.',
    sections: [
      {
        heading: 'Service operator',
        paragraphs: [
          `This policy is provided by ${OPERATOR_NAME}, the Delaware limited liability company that operates Chess Sagas. Our mailing address is ${OPERATOR_ADDRESS}.`,
        ],
      },
      {
        heading: 'One-time credit purchases',
        paragraphs: [
          'You may request a refund for an unused one-time credit purchase within 14 days of purchase. If any credits from that purchase have been consumed, the purchase is generally non-refundable except where required by law or where Chess Sagas confirms a duplicate, unauthorized, or erroneous charge.',
          'Approved refunds are returned to the original payment method. A full refund removes the credits granted by that purchase. If the credits have already been used or transferred into a negative balance by a refund, we may restrict new generation until the balance is resolved.',
        ],
      },
      {
        heading: 'Subscriptions and cancellation',
        paragraphs: [
          'Subscriptions renew automatically at the price and interval shown at checkout. You can cancel at any time through “Manage subscription” on the Saga Credits page. Cancellation normally takes effect at the end of the current paid billing period, and you retain subscription access through that date.',
          'Subscription charges are generally non-refundable and are not prorated for a partially used billing period, except where required by law or where Chess Sagas confirms a duplicate, unauthorized, or erroneous charge. Cancel before the renewal date to avoid the next charge.',
          'Credits already granted remain on the account after cancellation and currently do not expire. They roll over and can be used later. Cancellation prevents future renewals and future monthly credit grants.',
        ],
      },
      {
        heading: 'Generation retries, failures, and reuse',
        paragraphs: [
          'Starting a new saga reserves one credit. Automatic retries, corrections, and validation steps for that same job do not consume extra credits. The reserved credit is consumed only after a completed saga is saved.',
          'If the job reaches terminal failure, its reservation is released automatically. If the credit does not return after a reasonable processing period, contact support with the account email and approximate generation time.',
          'Replaying, reopening, or reusing an existing completed saga does not consume another credit. Reuse is not a failed purchase and does not create a cash refund because no new credit is consumed.',
        ],
      },
      {
        heading: 'Failed or reversed payments',
        paragraphs: [
          'Credits are granted only after successful payment confirmation. Failed, disputed, reversed, refunded, or fraudulent payments may delay or remove credits, suspend subscription benefits, or restrict the account while the issue is investigated.',
        ],
      },
      {
        heading: 'How to request help or a refund',
        paragraphs: [
          `Open Contact Support, choose “Billing,” and include the account email, purchase date, amount, and a short explanation. Do not send card numbers, bank details, passwords, or private keys. You may also email don@creamofthecrop.tech or write to ${OPERATOR_NAME}, ${OPERATOR_ADDRESS}.`,
          'We may request reasonable information to verify the account and transaction. Refund timing after approval is controlled by the payment processor and financial institution.',
        ],
      },
      {
        heading: 'Changes and legal rights',
        paragraphs: [
          `This policy is effective ${EFFECTIVE_DATE}. Nothing in it limits non-waivable refund, cancellation, or consumer rights under applicable law. Material changes will apply prospectively and will be announced through the service or another reasonable method.`,
        ],
      },
    ],
  },
};

@Component({
  selector: 'app-legal',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './legal.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './legal.component.css',
})
export class LegalComponent {
  readonly effectiveDate = EFFECTIVE_DATE;
  readonly page: LegalPage;

  constructor() {
    const key = inject(ActivatedRoute).snapshot.data['legalPage'] as LegalPageKey;
    this.page = PAGES[key];
  }
}
