export interface WebsiteContent {
  about: string;
  services: string;
  devices: string;
  show_steps: boolean;
  faqs: { question: string; answer: string }[];
}
import { defaultWebsiteContent } from "../../services/websites/content.mjs";
export { defaultWebsiteContent };
export const websiteContent = (saved?: Partial<WebsiteContent>) => ({
  ...defaultWebsiteContent,
  ...saved,
});
