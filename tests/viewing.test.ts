import test from "node:test";
import assert from "node:assert/strict";
import { validViewingDate, viewingDateLabel } from "../src/lib/viewing-date";
import { validateInquiry } from "../src/lib/validation";

test("viewing dates validate actual calendar days and the one-year request window", () => {
  const now = new Date("2027-03-01T00:30:00Z");
  assert.equal(validViewingDate("2027-02-28", now), true); // Still today in America.
  assert.equal(validViewingDate("2027-02-27", now), false);
  assert.equal(validViewingDate("2027-02-29", now), false);
  assert.equal(validViewingDate("2027-04-31", now), false);
  assert.equal(validViewingDate("2028-02-29", now), true);
  assert.equal(validViewingDate("2029-01-01", now), false);
  assert.equal(validViewingDate("2027-03-01T12:00:00Z", now), false);
  assert.equal(validViewingDate({ date: "2027-03-02" }, now), false);
  assert.equal(viewingDateLabel("2026-11-01"), "Sunday, November 1, 2026");
});

test("viewing requests preserve the preferred date in the existing private inbox message", () => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 3);
  const preferredDate = date.toISOString().slice(0, 10);
  const result = validateInquiry({
    slug: "the-garden-residence",
    name: "Alex Morgan",
    email: "ALEX@example.com",
    phone: "+1 (202) 555-0100",
    message: "An afternoon visit would be lovely.",
    website: "",
    preferredDate,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.email, "alex@example.com");
  assert.match(result.value.message, /Viewing request/);
  assert.ok(result.value.message.includes(preferredDate));
  assert.match(result.value.message, /Time and availability to be confirmed/);
  assert.match(result.value.message, /An afternoon visit would be lovely/);
  assert.equal(result.value.slug, "the-garden-residence");
});

test("viewing requests need a valid date and phone; ordinary inquiries still need a message", () => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 1);
  const base = {
    slug: "the-garden-residence",
    name: "Alex Morgan",
    email: "alex@example.com",
    phone: "+1 (202) 555-0100",
    message: "",
    website: "",
  };
  assert.equal(validateInquiry({ ...base }).ok, false);
  assert.equal(
    validateInquiry({ ...base, preferredDate: date.toISOString().slice(0, 10) })
      .ok,
    true,
  );
  assert.equal(
    validateInquiry({ ...base, preferredDate: "2026-02-31" }).ok,
    false,
  );
  assert.equal(validateInquiry({ ...base, preferredDate: "" }).ok, false);
  assert.equal(
    validateInquiry({
      ...base,
      phone: "abc",
      preferredDate: date.toISOString().slice(0, 10),
    }).ok,
    false,
  );
  assert.equal(
    validateInquiry({
      ...base,
      website: "spam",
      preferredDate: date.toISOString().slice(0, 10),
    }).ok,
    false,
  );
  assert.equal(
    validateInquiry({
      ...base,
      message: "x".repeat(1601),
      preferredDate: date.toISOString().slice(0, 10),
    }).ok,
    false,
  );
});
