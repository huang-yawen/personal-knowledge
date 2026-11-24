import { expect, test } from "vitest";
import { remarkCitations } from "./remark-citations";

type Node = { type: string; value?: string; url?: string; children?: Node[] };

const run = (tree: Node): Node => {
  remarkCitations()(tree);
  return tree;
};

test("把正文里的引用编号换成 #cite- 链接", () => {
  const tree = run({
    type: "root",
    children: [
      { type: "paragraph", children: [{ type: "text", value: "结论见 [1]，另见 [2, 3]。" }] },
    ],
  });

  const paragraph = tree.children?.[0];
  expect(paragraph?.children?.map((node) => node.type)).toEqual(["text", "link", "text", "link", "text"]);
  expect(paragraph?.children?.[1].url).toBe("#cite-1");
  expect(paragraph?.children?.[3].url).toBe("#cite-2,3");
});

test("代码块、行内代码和已有链接里的方括号保持原样", () => {
  const tree = run({
    type: "root",
    children: [
      { type: "code", value: "[1]", children: [] },
      { type: "paragraph", children: [{ type: "inlineCode", value: "[2]" }] },
      { type: "paragraph", children: [{ type: "link", url: "https://example.com", children: [{ type: "text", value: "[3]" }] }] },
    ],
  });

  expect(tree.children?.[0].value).toBe("[1]");
  expect(tree.children?.[1].children?.[0].value).toBe("[2]");
  expect(tree.children?.[2].children?.[0].url).toBe("https://example.com");
  expect(tree.children?.[2].children?.[0].children?.[0].value).toBe("[3]");
});
