import { LegalDoc } from '../../components/LegalDoc';
import { TERMS_SECTIONS } from '../../content/legal';

export default function Terms() {
  return <LegalDoc title="Terms & Conditions" sections={TERMS_SECTIONS} />;
}
