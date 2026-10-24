import type { Property } from "../src/lib/model";
import { propertyStory, type StoryDraft } from "../src/lib/property-story";

// Deterministic provider fixture. These words are test data, never demo AI output.
export function storyFixture(property: Property): StoryDraft {
  const paragraph =
    "Explore the spaces and details in these property photographs. Arrange a private tour to picture your next chapter in person.";
  return {
    description: paragraph,
    content: {
      ...propertyStory(property),
      heroIntro: paragraph,
      introBody: paragraph,
      detailsBody: paragraph,
      settingBody: paragraph,
      galleryBody: paragraph,
      closingBody: paragraph,
    },
  };
}
