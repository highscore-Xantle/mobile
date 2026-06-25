/** Static copy for Settings → About / Terms / Privacy. Source: Highscore Tech legal draft. */

export type DocBlock = { text: string } | { bullets: string[] };
export type DocSection = { heading: string; blocks: DocBlock[] };

export const APP_INTRO =
  'Welcome to Xantle, a party and group games platform designed for real-life gatherings such as hangouts, picnics, dates, and social events. Xantle allows users to join interactive game rooms, play real-time group games, and enjoy shared social experiences.\n\nBy downloading, accessing, or using Xantle, you agree to the Terms & Conditions and Privacy Policy.';

export const TERMS_SECTIONS: DocSection[] = [
  {
    heading: 'Eligibility',
    blocks: [
      {
        bullets: [
          'You must be at least 13 years old to use Xantle.',
          'You must provide accurate information when creating an account.',
        ],
      },
    ],
  },
  {
    heading: 'Purpose of the Platform',
    blocks: [
      { text: 'Xantle is a social gaming and party experience app that allows users to:' },
      {
        bullets: [
          'Create and join real-time game rooms',
          'Play interactive group games during real-life gatherings',
          'Connect with friends in social environments',
        ],
      },
      { text: 'Xantle is not a gambling app and does not involve real-money betting.' },
    ],
  },
  {
    heading: 'Account Responsibility',
    blocks: [
      {
        bullets: [
          'You are responsible for your account security.',
          'You must not share or sell your account.',
          'You are responsible for all actions performed under your account.',
        ],
      },
    ],
  },
  {
    heading: 'Acceptable Use',
    blocks: [
      { text: 'To maintain a safe and fun experience, users must NOT:' },
      {
        bullets: [
          'Cheat, exploit bugs, or manipulate game systems',
          'Use bots, hacks, or unauthorized tools',
          'Harass, bully, or abuse other users',
          'Upload offensive, illegal, or harmful content',
          'Attempt to break or disrupt the app or servers',
        ],
      },
      { text: 'Violation may result in temporary suspension or permanent ban.' },
    ],
  },
  {
    heading: 'Real-Time Game System',
    blocks: [
      {
        bullets: [
          'Xantle uses real-time multiplayer rooms where users interact live.',
          'Game outcomes are based on system logic and player input.',
          'We do not guarantee winning outcomes or fairness beyond system rules.',
          'Lag, network issues, or device performance may affect gameplay.',
        ],
      },
    ],
  },
  {
    heading: 'User-Generated Content',
    blocks: [
      { text: 'Users may create or share:' },
      { bullets: ['Game room names', 'Messages', 'Profile content'] },
      {
        text: 'You are responsible for any content you post. Xantle may remove content that is inappropriate or violates rules.',
      },
    ],
  },
  {
    heading: 'Premium Subscription',
    blocks: [
      {
        bullets: [
          'Xantle may offer a premium subscription ($4.99/month).',
          'Premium features may include group play access, enhanced game features, and exclusive content.',
          'Subscriptions are billed automatically and may be managed or canceled through app store settings.',
          'Payments are non-refundable unless required by law.',
        ],
      },
    ],
  },
  {
    heading: 'Ads',
    blocks: [
      {
        bullets: [
          'Xantle may display advertisements.',
          'Ads help support the free version of the app.',
          'Premium users may experience reduced or no ads depending on plan structure.',
        ],
      },
    ],
  },
  {
    heading: 'Game Engine & Updates',
    blocks: [
      {
        bullets: [
          'Xantle uses a modular game system where new games may be added over time.',
          'Features, games, and mechanics may change or be updated without notice to improve user experience.',
        ],
      },
    ],
  },
  {
    heading: 'Safety & Social Interaction',
    blocks: [
      { text: 'Since Xantle is designed for real-life gatherings:' },
      {
        bullets: [
          'Users are responsible for their safety when meeting others.',
          'We recommend meeting in safe, public, or familiar environments.',
          'Xantle is not responsible for incidents during physical meetups or events.',
        ],
      },
    ],
  },
  {
    heading: 'Termination',
    blocks: [
      { text: 'We may suspend or permanently ban accounts if users:' },
      {
        bullets: [
          'Violate these Terms',
          'Abuse the platform or other users',
          'Attempt fraud or system manipulation',
          'Harm the integrity of the app',
        ],
      },
    ],
  },
  {
    heading: 'Disclaimer',
    blocks: [
      { text: 'Xantle is provided on an "as is" and "as available" basis. We do not guarantee:' },
      {
        bullets: [
          'Continuous uptime',
          'Error-free performance',
          'Specific game outcomes',
          'Safe behavior of users outside the app',
        ],
      },
    ],
  },
  {
    heading: 'Limitation of Liability',
    blocks: [
      { text: 'Xantle is not liable for:' },
      {
        bullets: [
          'Losses during events or gatherings',
          'User disputes or interactions',
          'Data loss or device issues',
          'Indirect or incidental damages',
        ],
      },
    ],
  },
  {
    heading: 'Changes to Terms',
    blocks: [
      {
        text: 'We may update these Terms at any time. Continued use of Xantle means you accept the updated version.',
      },
    ],
  },
];

export const PRIVACY_SECTIONS: DocSection[] = [
  {
    heading: 'Information We Collect',
    blocks: [
      { text: 'Personal Data' },
      { bullets: ['Name', 'Username', 'Email address', 'Profile information'] },
      { text: 'Gameplay Data' },
      { bullets: ['Game room activity', 'Scores and interactions', 'Participation history'] },
      { text: 'Device Data' },
      {
        bullets: [
          'Device type',
          'IP address',
          'Operating system',
          'Crash logs and performance data',
        ],
      },
    ],
  },
  {
    heading: 'How We Use Data',
    blocks: [
      { text: 'We use your information to:' },
      {
        bullets: [
          'Create and manage accounts',
          'Enable real-time multiplayer games',
          'Improve gameplay experience',
          'Detect cheating or abuse',
          'Provide support',
          'Show relevant ads',
          'Manage subscriptions',
        ],
      },
    ],
  },
  {
    heading: 'Data Sharing',
    blocks: [
      { text: 'We do not sell your data. We may share limited data:' },
      {
        bullets: [
          'With other players in game rooms (username, profile info)',
          'With service providers (Supabase, analytics, payments)',
          'If required by law or safety enforcement',
        ],
      },
    ],
  },
  {
    heading: 'Real-Time Features',
    blocks: [
      { text: 'Xantle uses real-time communication systems (Supabase Realtime):' },
      {
        bullets: [
          'Messages and game actions may be temporarily processed for live gameplay',
          'Data is transmitted securely where possible',
        ],
      },
    ],
  },
  {
    heading: 'Data Security',
    blocks: [
      {
        text: 'We use industry-standard security practices to protect your data, but no system is completely secure.',
      },
    ],
  },
  {
    heading: 'Your Rights',
    blocks: [
      { text: 'You can:' },
      {
        bullets: [
          'Access your account data',
          'Update or delete your profile',
          'Disable certain permissions',
          'Cancel subscriptions',
        ],
      },
    ],
  },
  {
    heading: 'Cookies & Analytics',
    blocks: [
      { text: 'We may use cookies and analytics tools to:' },
      {
        bullets: [
          'Improve performance',
          'Understand user behavior',
          'Optimize gameplay experience',
        ],
      },
    ],
  },
];
