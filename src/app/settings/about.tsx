import Constants from 'expo-constants';
import { LegalDoc } from '../../components/LegalDoc';
import { APP_INTRO } from '../../content/legal';

export default function About() {
  const version = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <LegalDoc
      title="About"
      intro={APP_INTRO}
      sections={[
        {
          heading: 'Version',
          blocks: [{ text: `Xantle ${version} · made by Highscore Tech` }],
        },
      ]}
    />
  );
}
