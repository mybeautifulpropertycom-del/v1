import { strToU8, zipSync } from "fflate";
import { xmlEscape } from "@/lib/sitemap";
import { handoverTemplate } from "../handover-template";

export const dynamic = "force-static";

const header = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const contentType =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function paragraph(text: string, heading = false) {
  return `<w:p><w:pPr><w:spacing w:after="${heading ? 115 : 55}"/></w:pPr><w:r><w:rPr>${heading ? "<w:b/>" : ""}<w:sz w:val="${heading ? 24 : 21}"/></w:rPr><w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r></w:p>`;
}

export function GET() {
  const body = [
    paragraph(handoverTemplate.title, true),
    ...handoverTemplate.sections.flatMap(({ title, fields }) => [
      paragraph(title, true),
      ...fields.map((text) => paragraph(text)),
    ]),
  ].join("");
  const archive = zipSync({
    "[Content_Types].xml": strToU8(
      `${header}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="${contentType}.main+xml"/></Types>`,
    ),
    "_rels/.rels": strToU8(
      `${header}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    ),
    "word/document.xml": strToU8(
      `${header}<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1000" w:right="1000" w:bottom="1000" w:left="1000" w:header="400" w:footer="400" w:gutter="0"/></w:sectPr></w:body></w:document>`,
    ),
  });
  return new Response(new Uint8Array(archive), {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition":
        'attachment; filename="proces-verbal-predare-apartament.docx"',
      "X-Robots-Tag": "noindex",
    },
  });
}
