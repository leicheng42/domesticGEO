const fs = require("fs");
const path = require("path");

const SITE_ROOT = path.join(__dirname, "..", "mirror", "www.geokeji.com");
const BLOG_INDEX_FILE = path.join(SITE_ROOT, "blog.html");

let blogListCache = {
  mtimeMs: 0,
  posts: [],
};

function normalizeCoverUrl(coverUrl) {
  const value = String(coverUrl || "").trim();
  if (!value) return "";
  if (value.startsWith("http://") || value.startsWith("https://") || value.startsWith("/")) {
    return value;
  }
  return `/${value.replace(/^\/+/, "")}`;
}

function parseNextDataFromHtml(html) {
  const match = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/,
  );
  if (!match) {
    return null;
  }
  try {
    return JSON.parse(match[1]);
  } catch (error) {
    return null;
  }
}

function normalizeStaticPost(item) {
  const slug = String(item.slug || "").trim();
  if (!slug) return null;
  const publishedAt = String(item.date || "").trim();
  return {
    id: `static:${slug}`,
    source: "static",
    status: "published",
    slug,
    title: String(item.title || "").trim(),
    excerpt: String(item.excerpt || "").trim(),
    coverUrl: normalizeCoverUrl(item.coverImage),
    category: String(item.category || "").trim(),
    readTime: String(item.readTime || "").trim(),
    tags: Array.isArray(item.tags) ? item.tags : [],
    publishedAt,
    updatedAt: publishedAt,
    createdAt: publishedAt,
  };
}

function comparePostDateDesc(left, right) {
  const leftTime = new Date(left.publishedAt || left.updatedAt || 0).getTime();
  const rightTime = new Date(right.publishedAt || right.updatedAt || 0).getTime();
  return rightTime - leftTime;
}

function loadStaticPostsFromBlogIndex() {
  if (!fs.existsSync(BLOG_INDEX_FILE)) {
    return [];
  }

  const stat = fs.statSync(BLOG_INDEX_FILE);
  if (blogListCache.mtimeMs === stat.mtimeMs && blogListCache.posts.length > 0) {
    return blogListCache.posts.map((post) => ({ ...post }));
  }

  const html = fs.readFileSync(BLOG_INDEX_FILE, "utf8");
  const nextData = parseNextDataFromHtml(html);
  const allPosts = nextData?.props?.pageProps?.allPosts;
  if (!Array.isArray(allPosts)) {
    blogListCache = { mtimeMs: stat.mtimeMs, posts: [] };
    return [];
  }

  const posts = allPosts
    .map(normalizeStaticPost)
    .filter(Boolean)
    .sort(comparePostDateDesc);

  blogListCache = {
    mtimeMs: stat.mtimeMs,
    posts,
  };
  return posts.map((post) => ({ ...post }));
}

function getStaticPosts() {
  return loadStaticPostsFromBlogIndex();
}

function getStaticPostBySlug(slug) {
  const target = String(slug || "").trim();
  if (!target) return null;

  const listItem = getStaticPosts().find((post) => post.slug === target);
  if (!listItem) return null;

  const detailFile = path.join(SITE_ROOT, "blog", `${target}.html`);
  if (!detailFile.startsWith(path.join(SITE_ROOT, "blog")) || !fs.existsSync(detailFile)) {
    return listItem;
  }

  const html = fs.readFileSync(detailFile, "utf8");
  const nextData = parseNextDataFromHtml(html);
  const pageProps = nextData?.props?.pageProps || {};
  const post = pageProps.post && typeof pageProps.post === "object" ? pageProps.post : null;

  if (!post) {
    return listItem;
  }

  return {
    ...listItem,
    title: String(post.title || listItem.title || "").trim(),
    excerpt: String(post.excerpt || listItem.excerpt || "").trim(),
    coverUrl: normalizeCoverUrl(post.coverImage || listItem.coverUrl),
    category: String(post.category || listItem.category || "").trim(),
    readTime: String(post.readTime || listItem.readTime || "").trim(),
    tags: Array.isArray(post.tags) ? post.tags : listItem.tags || [],
    content: String(post.content || "").trim(),
    contentHtml: String(pageProps.contentHtml || "").trim(),
    publishedAt: String(post.date || listItem.publishedAt || "").trim(),
    updatedAt: String(post.date || listItem.updatedAt || "").trim(),
  };
}

module.exports = {
  getStaticPosts,
  getStaticPostBySlug,
};
