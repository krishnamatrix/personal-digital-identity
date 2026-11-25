import type { PublishedContent } from "@/domains/website/published-content";

/**
 * A fictional person for previewing designs in the Folio Designer (never a real account). It
 * fills every common section so a designer sees headings, timelines, chips and contact at once.
 */
export const SAMPLE_SITE: PublishedContent = {
  version: 1,
  person: {
    name: "Jordan Avery",
    headline: "Product designer for calm, useful software.",
    role: "Principal Product Designer, Northwind",
    location: "Lisbon, Portugal",
    shortBio:
      "Twelve years designing tools for people who do complicated work. I care about clarity, kindness and shipping.",
    contactEmail: "jordan@example.com",
  },
  sections: [
    {
      id: "about",
      heading: "About",
      paragraphs: [
        "I lead design for Northwind's analytics products, working closely with research and engineering from the first sketch to the last release.",
        "Before that I built design systems for two start-ups and taught interaction design part-time.",
      ],
    },
    {
      id: "experience",
      heading: "Experience",
      items: [
        {
          title: "Principal Product Designer",
          organization: "Northwind",
          location: "Lisbon",
          start: "2021-03",
          current: true,
          description:
            "Lead a team of six designers across the analytics suite. Introduced a shared design system used by 40 engineers.",
        },
        {
          title: "Senior Designer",
          organization: "Fabrikam Labs",
          start: "2017-01",
          end: "2021-02",
          description:
            "Designed the onboarding and billing flows; raised activation by a fifth.",
        },
      ],
    },
    {
      id: "education",
      heading: "Education",
      items: [
        {
          institution: "Lisbon School of Design",
          qualification: "MA",
          specialization: "Interaction Design",
          start: "2013-09",
          end: "2015-07",
        },
      ],
    },
    {
      id: "skills",
      heading: "Skills",
      groups: [
        {
          category: "Design",
          skills: [
            { name: "Product strategy" },
            { name: "Design systems" },
            { name: "Prototyping" },
          ],
        },
        {
          category: "Research",
          skills: [{ name: "Interviews" }, { name: "Usability testing" }],
        },
      ],
    },
    {
      id: "projects",
      heading: "Projects",
      items: [
        {
          name: "Atlas design system",
          role: "Lead",
          description:
            "Tokens, components and guidelines for every Northwind product.",
          technologies: ["Figma", "React", "Storybook"],
        },
        {
          name: "Quiet dashboards",
          description: "A study of how fewer charts can tell a clearer story.",
        },
      ],
    },
    {
      id: "contact",
      heading: "Contact",
      email: "jordan@example.com",
      website: "https://jordan.example",
    },
  ],
};
