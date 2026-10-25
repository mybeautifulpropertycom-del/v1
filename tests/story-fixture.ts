import type { Property } from "../src/lib/model";
import { propertyStory, type StoryDraft } from "../src/lib/property-story";

// Deterministic provider fixture. These words are test data, never demo AI output.
export function storyFixture(property: Property): StoryDraft {
  const { storyBody: _body, ...content } = propertyStory(property);
  return {
    description:
      "The second photograph offers a closer perspective on the living space. Visit in person to imagine how you would make it your own.",
    content: {
      ...content,
      heroIntro:
        "A welcoming first view sets the scene for this home. Step inside for a new perspective.",
      introBody:
        "The cover view introduces a home with room for your next chapter. Discover its possibilities on a private visit.",
      detailsBody:
        "Look closer at the details of the third photograph. A tour is an opportunity to explore the features that matter to you.",
      settingBody:
        "Discover the setting of this property in its own surroundings. Ask your agent about exploring the area during your visit.",
      galleryBody:
        "Each photograph reveals another perspective on the home. Browse the spaces and choose what you would like to explore in person.",
      closingBody:
        "Bring your questions and see the home at your own pace. Contact your agent to arrange a private tour.",
    },
  };
}
