import test from "node:test";
import assert from "node:assert/strict";
import {
  BUILT_IN_STUDIO_TEMPLATES,
  cloneCanvasDoc,
  createBlankCanvasDoc,
} from "../studio-templates";
import { STUDIO_FONTS, STUDIO_ICONS } from "../studio-assets";

test("all 16 Crown Paints agency-grade templates have valid structure, bounds, infographics, fonts, and icons", () => {
  assert.equal(BUILT_IN_STUDIO_TEMPLATES.length, 16);

  const fontKeys = new Set(STUDIO_FONTS.map((f) => f.key));
  const iconNames = new Set(STUDIO_ICONS.map((i) => i.name));

  // Verify exact division & department coverage
  assert.equal(
    BUILT_IN_STUDIO_TEMPLATES.filter((t) => t.category === "decorative").length,
    4
  );
  assert.equal(
    BUILT_IN_STUDIO_TEMPLATES.filter((t) => t.category === "automotive").length,
    3
  );
  assert.equal(
    BUILT_IN_STUDIO_TEMPLATES.filter((t) => t.category === "industrial").length,
    3
  );
  assert.equal(
    BUILT_IN_STUDIO_TEMPLATES.filter((t) => t.category === "department").length,
    6
  );
  assert.ok(BUILT_IN_STUDIO_TEMPLATES.some((t) => t.departmentCode === "PMG"));

  const seenElementTypes = new Set<string>();

  for (const tpl of BUILT_IN_STUDIO_TEMPLATES) {
    assert.equal(tpl.canvasDoc.version, 1);
    assert.ok(
      tpl.canvasDoc.elements.length >= 4,
      `${tpl.id} should have rich elements`
    );

    for (const el of tpl.canvasDoc.elements) {
      seenElementTypes.add(el.type);
      assert.ok(el.x >= 0 && el.x <= 100, `${tpl.id}/${el.id} x out of range`);
      assert.ok(el.y >= 0 && el.y <= 100, `${tpl.id}/${el.id} y out of range`);
      assert.ok(el.w > 0 && el.w <= 100, `${tpl.id}/${el.id} w out of range`);
      assert.ok(el.h > 0 && el.h <= 100, `${tpl.id}/${el.id} h out of range`);
      assert.ok(
        el.x + el.w <= 100,
        `${tpl.id}/${el.id} x+w (${el.x + el.w}) overflows 100`
      );
      assert.ok(
        el.y + el.h <= 100,
        `${tpl.id}/${el.id} y+h (${el.y + el.h}) overflows 100`
      );

      if (el.rotation !== undefined) {
        assert.ok(
          Number.isInteger(el.rotation) &&
            el.rotation >= -360 &&
            el.rotation <= 360,
          `${tpl.id}/${el.id} rotation must be integer within -360..360`
        );
      }
      if (el.fontFamily) {
        assert.ok(
          fontKeys.has(el.fontFamily),
          `${tpl.id}/${el.id} unknown font ${el.fontFamily}`
        );
      }
      if (el.type === "icon" && el.iconName) {
        assert.ok(
          iconNames.has(el.iconName),
          `${tpl.id}/${el.id} unknown icon ${el.iconName}`
        );
      }
    }
  }

  // Ensure new Figma/Canva designer primitives are actively showcased across the 16 templates
  for (const requiredType of [
    "chart_bar",
    "chart_donut",
    "chart_progress",
    "table_spec",
    "separator",
    "step_number",
    "list_block",
  ]) {
    assert.ok(
      seenElementTypes.has(requiredType),
      `Expected templates to showcase ${requiredType}`
    );
  }
});

test("createBlankCanvasDoc and cloneCanvasDoc produce independent mutable copies", () => {
  const blank = createBlankCanvasDoc("portrait", "gallery_white");
  assert.equal(blank.orientation, "portrait");
  assert.ok(blank.elements.length >= 3);

  const copy = cloneCanvasDoc(blank);
  copy.elements[0].text = "Modified";
  assert.notEqual(blank.elements[0].text, "Modified");
});
