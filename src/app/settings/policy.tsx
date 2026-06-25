import { LegalDoc } from '../../components/LegalDoc';
import { PRIVACY_SECTIONS } from '../../content/legal';

export default function PrivacyPolicy() {
  return <LegalDoc title="Privacy Policy" sections={PRIVACY_SECTIONS} />;
}
