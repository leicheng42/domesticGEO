const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "..", "data", "site-data.json");

const DEFAULT_DATA = {
  brand: {
    shortName: "移山科技",
    fullName: "北京移山科技有限公司",
    slogan: "让您的品牌成为 AI 搜索的首选答案",
    logoUrl: "/logo.png%3Fv=2",
    phone: "400-990-9800",
    email: "service@geokeji.com",
    beijingAddress: "北京市朝阳区凤凰置地广场A座21层",
    xianAddress: "陕西省西安市碑林区长安国际中心E座22层",
    footerCopyright: "© 2026 移山科技. All rights reserved.",
  },
  posts: [],
  submissions: [],
};

function ensureDataFile() {
  const dir = path.dirname(DATA_FILE);
  fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(DEFAULT_DATA, null, 2), "utf8");
  }
}

function withDefaults(data) {
  const safe = data && typeof data === "object" ? data : {};
  return {
    brand: { ...DEFAULT_DATA.brand, ...(safe.brand || {}) },
    posts: Array.isArray(safe.posts) ? safe.posts : [],
    submissions: Array.isArray(safe.submissions) ? safe.submissions : [],
  };
}

function readData() {
  ensureDataFile();
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    return withDefaults(JSON.parse(raw));
  } catch (error) {
    const fallback = withDefaults(null);
    writeData(fallback);
    return fallback;
  }
}

function writeData(nextData) {
  const safe = withDefaults(nextData);
  fs.writeFileSync(DATA_FILE, JSON.stringify(safe, null, 2), "utf8");
  return safe;
}

function slugify(input) {
  const value = String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-\u4e00-\u9fa5]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return value || `post-${Date.now()}`;
}

function uniqueSlug(data, targetSlug, currentId) {
  const base = slugify(targetSlug);
  let slug = base;
  let index = 2;
  while (
    data.posts.some((post) => post.slug === slug && String(post.id) !== String(currentId || ""))
  ) {
    slug = `${base}-${index}`;
    index += 1;
  }
  return slug;
}

function updateBrand(patch) {
  const data = readData();
  data.brand = {
    ...data.brand,
    shortName: String(patch.shortName || data.brand.shortName).trim(),
    fullName: String(patch.fullName || data.brand.fullName).trim(),
    slogan: String(patch.slogan || data.brand.slogan).trim(),
    logoUrl: String(patch.logoUrl || data.brand.logoUrl).trim(),
    phone: String(patch.phone || data.brand.phone).trim(),
    email: String(patch.email || data.brand.email).trim(),
    beijingAddress: String(patch.beijingAddress || data.brand.beijingAddress).trim(),
    xianAddress: String(patch.xianAddress || data.brand.xianAddress).trim(),
    footerCopyright: String(
      patch.footerCopyright || data.brand.footerCopyright,
    ).trim(),
  };
  writeData(data);
  return data.brand;
}

function getBrand() {
  return readData().brand;
}

function getAllPosts() {
  const data = readData();
  return [...data.posts].sort((a, b) => {
    const left = new Date(b.updatedAt || b.createdAt || 0).getTime();
    const right = new Date(a.updatedAt || a.createdAt || 0).getTime();
    return left - right;
  });
}

function getPublishedPosts() {
  return getAllPosts()
    .filter((post) => post.status === "published")
    .sort((a, b) => {
      const left = new Date(b.publishedAt || b.updatedAt || 0).getTime();
      const right = new Date(a.publishedAt || a.updatedAt || 0).getTime();
      return left - right;
    });
}

function getPostById(id) {
  const data = readData();
  return data.posts.find((post) => String(post.id) === String(id)) || null;
}

function getPostBySlug(slug) {
  const target = String(slug || "");
  const data = readData();
  return data.posts.find((post) => post.slug === target) || null;
}

function getPublishedPostBySlug(slug) {
  const target = String(slug || "");
  const data = readData();
  return data.posts.find((post) => post.slug === target && post.status === "published") || null;
}

function savePost(input, postId) {
  const data = readData();
  const now = new Date().toISOString();
  const existingIndex = data.posts.findIndex((post) => String(post.id) === String(postId || ""));
  const existing = existingIndex >= 0 ? data.posts[existingIndex] : null;

  const status = input.status === "draft" ? "draft" : "published";
  const title = String(input.title || existing?.title || "").trim();
  const excerpt = String(input.excerpt || existing?.excerpt || "").trim();
  const coverUrl = String(input.coverUrl || existing?.coverUrl || "").trim();
  const content = String(input.content || existing?.content || "").trim();
  const slug = uniqueSlug(data, input.slug || title, existing?.id);

  const post = {
    id: existing?.id || crypto.randomUUID(),
    title,
    slug,
    excerpt,
    coverUrl,
    content,
    status,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    publishedAt:
      status === "published"
        ? existing?.publishedAt || now
        : existing?.publishedAt || null,
  };

  if (existingIndex >= 0) {
    data.posts.splice(existingIndex, 1, post);
  } else {
    data.posts.push(post);
  }

  writeData(data);
  return post;
}

function deletePost(postId) {
  const data = readData();
  const nextPosts = data.posts.filter((post) => String(post.id) !== String(postId));
  data.posts = nextPosts;
  writeData(data);
}

function addSubmission(input) {
  const data = readData();
  const submission = {
    id: crypto.randomUUID(),
    name: String(input.name || "").trim(),
    company: String(input.company || "").trim(),
    phone: String(input.phone || "").trim(),
    position: String(input.position || "").trim(),
    message: String(input.message || "").trim(),
    source: String(input.source || "").trim(),
    payload: input.payload || {},
    createdAt: new Date().toISOString(),
  };
  data.submissions.unshift(submission);
  writeData(data);
  return submission;
}

function getSubmissions() {
  return readData().submissions;
}

module.exports = {
  DATA_FILE,
  getBrand,
  updateBrand,
  getAllPosts,
  getPublishedPosts,
  getPostById,
  getPostBySlug,
  getPublishedPostBySlug,
  savePost,
  deletePost,
  addSubmission,
  getSubmissions,
};
