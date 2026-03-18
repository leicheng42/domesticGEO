const express = require("express");
const fs = require("fs/promises");
const path = require("path");
const session = require("express-session");

const {
  addSubmission,
  deletePost,
  getAllPosts,
  getBrand,
  getPostById,
  getPostBySlug,
  getPublishedPostBySlug,
  getPublishedPosts,
  getSubmissions,
  savePost,
  updateBrand,
} = require("./store");
const { getStaticPostBySlug, getStaticPosts } = require("./static-posts");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123456";
const SESSION_SECRET = process.env.SESSION_SECRET || "geo-clone-session-secret";
const SITE_ROOT = path.join(__dirname, "..", "mirror", "www.geokeji.com");
const VIEWS_ROOT = path.join(__dirname, "..", "views");

app.set("views", VIEWS_ROOT);
app.set("view engine", "ejs");
app.disable("x-powered-by");

app.use(express.urlencoded({ extended: true, limit: "2mb" }));
app.use(express.json({ limit: "2mb" }));
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 12,
    },
  }),
);

app.use((req, res, next) => {
  res.locals.admin = req.session.admin || null;
  res.locals.path = req.path;
  next();
});

function isReservedRoute(routePath) {
  return (
    routePath.startsWith("/admin") ||
    routePath.startsWith("/api") ||
    routePath.startsWith("/runtime")
  );
}

function requireAdmin(req, res, next) {
  if (req.session.admin) {
    next();
    return;
  }
  const redirectTo = encodeURIComponent(req.originalUrl || "/admin");
  res.redirect(`/admin/login?next=${redirectTo}`);
}

function cleanRoutePath(routePath) {
  const decoded = decodeURIComponent(routePath || "/");
  const normalized = path.posix.normalize(decoded);
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

function hasExtension(routePath) {
  return path.posix.basename(routePath).includes(".");
}

function resolveSitePath(routePath) {
  const safePath = cleanRoutePath(routePath).replace(/^\/+/, "");
  const fullPath = path.join(SITE_ROOT, safePath);
  if (!fullPath.startsWith(SITE_ROOT)) {
    return null;
  }
  return fullPath;
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    return false;
  }
}

function injectRuntime(html) {
  if (html.includes("/runtime/site-runtime.js")) {
    return html;
  }
  return html.replace(
    "</body>",
    '<script src="/runtime/site-runtime.js" defer></script></body>',
  );
}

async function sendSiteHtml(res, absoluteFilePath) {
  let html = await fs.readFile(absoluteFilePath, "utf8");
  html = rewriteBlogListingForMergedPosts(html, absoluteFilePath);
  res.type("html").send(injectRuntime(html));
}

function buildContentHtml(rawText) {
  const chunks = String(rawText || "")
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
  return chunks
    .map(
      (chunk) =>
        `<p class="mb-5 leading-8 text-slate-700">${chunk
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/\n/g, "<br/>")}</p>`,
    )
    .join("");
}

function formatDatetime(datetime) {
  const date = new Date(datetime || Date.now());
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getMergedPublishedPosts() {
  const staticPosts = getStaticPosts();
  const managedPosts = getPublishedPosts().map((post) => ({ ...post, source: "managed" }));
  const mergedMap = new Map();

  for (const post of staticPosts) {
    mergedMap.set(post.slug, post);
  }
  for (const post of managedPosts) {
    mergedMap.set(post.slug, post);
  }

  return [...mergedMap.values()].sort((a, b) => {
    const left = new Date(b.publishedAt || b.updatedAt || 0).getTime();
    const right = new Date(a.publishedAt || a.updatedAt || 0).getTime();
    return left - right;
  });
}

function getMergedAllPostsForAdmin() {
  const staticPosts = getStaticPosts();
  const managedPosts = getAllPosts().map((post) => ({ ...post, source: "managed" }));
  const mergedMap = new Map();

  for (const post of staticPosts) {
    mergedMap.set(post.slug, post);
  }
  for (const post of managedPosts) {
    mergedMap.set(post.slug, post);
  }

  return [...mergedMap.values()].sort((a, b) => {
    const left = new Date(b.updatedAt || b.publishedAt || 0).getTime();
    const right = new Date(a.updatedAt || a.publishedAt || 0).getTime();
    return left - right;
  });
}

function escapeHtml(input) {
  return String(input || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function findDivBounds(html, openDivStart) {
  const openTagEnd = html.indexOf(">", openDivStart);
  if (openTagEnd < 0) return null;
  let depth = 1;
  let cursor = openTagEnd + 1;

  while (cursor < html.length) {
    const nextOpen = html.indexOf("<div", cursor);
    const nextClose = html.indexOf("</div>", cursor);
    if (nextClose < 0) return null;

    if (nextOpen >= 0 && nextOpen < nextClose) {
      depth += 1;
      cursor = nextOpen + 4;
      continue;
    }

    depth -= 1;
    if (depth === 0) {
      return {
        openTagEnd,
        closeTagStart: nextClose,
      };
    }
    cursor = nextClose + 6;
  }
  return null;
}

function renderUnifiedBlogCard(post) {
  const slug = encodeURIComponent(String(post.slug || "").trim());
  const title = escapeHtml(post.title || "");
  const excerpt = escapeHtml(post.excerpt || "");
  const coverUrl = escapeHtml(post.coverUrl || "/images/whitepaper-cover.png");
  const date = escapeHtml(String(post.publishedAt || post.updatedAt || "").slice(0, 10));
  const readTime = escapeHtml(post.readTime || "5分钟");
  const rawTags =
    Array.isArray(post.tags) && post.tags.length
      ? post.tags
      : post.category
        ? [post.category]
        : ["GEO"];
  const tagHtml = rawTags
    .slice(0, 3)
    .map(
      (tag) =>
        `<span class="text-xs px-2 py-1 bg-gray-50 border border-gray-200 rounded-md text-gray-600 hover:border-sky-300 transition-colors">${escapeHtml(tag)}</span>`,
    )
    .join("");

  return (
    `<a href="/blog/${slug}">` +
    `<div class="rounded-2xl p-6 transition-all duration-300 bg-white/95 text-gray-900 border border-gray-200 hover:transform hover:scale-105 hover:shadow-2xl hover:border-[#635BFF]/50 cursor-pointer h-full group bg-white shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300">` +
    `<div class="relative aspect-[3/2] mb-4 rounded-xl overflow-hidden ">` +
    `<img alt="${title}" loading="lazy" decoding="async" class="object-cover" style="position:absolute;height:100%;width:100%;left:0;top:0;right:0;bottom:0;color:transparent" src="${coverUrl}"/>` +
    `<div class="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent"></div>` +
    `</div>` +
    `<h3 class="text-lg md:text-xl font-bold text-gray-900 mb-3 leading-tight line-clamp-2 group-hover:text-sky-600 transition-colors">${title}</h3>` +
    `<p class="text-gray-600 text-sm mb-4 line-clamp-3 leading-relaxed">${excerpt}</p>` +
    `<div class="flex flex-wrap gap-2 mb-4">${tagHtml}</div>` +
    `<div class="flex items-center justify-between text-xs text-gray-500 pt-4 border-t border-gray-100">` +
    `<span>${date}</span>` +
    `<span>${readTime}</span>` +
    `</div>` +
    `</div>` +
    `</a>`
  );
}

function rewriteBlogListingForMergedPosts(html, absoluteFilePath) {
  const normalized = absoluteFilePath.replace(/\\/g, "/");
  if (!normalized.endsWith("/blog.html")) {
    return html;
  }

  const items = getMergedPublishedPosts();
  if (!items.length) {
    return html;
  }

  const gridMarker = '<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">';
  const gridStart = html.indexOf(gridMarker);
  if (gridStart < 0) {
    return html;
  }

  const bounds = findDivBounds(html, gridStart);
  if (!bounds) {
    return html;
  }

  const cards = items.map(renderUnifiedBlogCard).join("");
  return html.slice(0, bounds.openTagEnd + 1) + cards + html.slice(bounds.closeTagStart);
}

app.get("/runtime/site-runtime.js", (req, res) => {
  const brand = getBrand();
  const brandJson = JSON.stringify(brand);
  const runtimeScript = `
(function () {
  var brand = ${brandJson};

  function replaceText(root, matcher, replacement) {
    if (!root) return;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var nodes = [];
    while (walker.nextNode()) {
      nodes.push(walker.currentNode);
    }
    nodes.forEach(function (node) {
      if (!node.nodeValue || !matcher.test(node.nodeValue)) return;
      node.nodeValue = node.nodeValue.replace(matcher, replacement);
    });
  }

  function applyBrand() {
    if (!brand) return;
    var logos = document.querySelectorAll('img[src*="logo.png"], img[alt*="移山科技"]');
    logos.forEach(function (img) {
      if (brand.logoUrl) img.src = brand.logoUrl;
      if (brand.shortName) img.alt = brand.shortName;
    });

    if (brand.shortName) {
      document.title = document.title.replace(/移山科技/g, brand.shortName);
      replaceText(document.body, /移山科技官网/g, brand.shortName + "官网");
      replaceText(document.body, /移山科技/g, brand.shortName);
    }
    if (brand.fullName) replaceText(document.body, /北京移山科技有限公司/g, brand.fullName);
    if (brand.phone) replaceText(document.body, /400-990-9800|\\+86-400-990-9800/g, brand.phone);
    if (brand.beijingAddress) {
      replaceText(document.body, /北京市朝阳区凤凰置地广场A座21层/g, brand.beijingAddress);
    }
    if (brand.xianAddress) {
      replaceText(document.body, /陕西省西安市碑林区长安国际中心E座22层/g, brand.xianAddress);
    }
  }

  function boot() {
    applyBrand();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
`.trim();

  res.type("application/javascript").send(runtimeScript);
});

app.get("/api/public/brand", (req, res) => {
  res.json({ brand: getBrand() });
});

app.get("/api/public/posts", (req, res) => {
  const source = String(req.query.source || "all");
  const itemsSource =
    source === "managed"
      ? getPublishedPosts().map((post) => ({ ...post, source: "managed" }))
      : getMergedPublishedPosts();
  const items = itemsSource.map((post) => ({
    id: post.id,
    title: post.title,
    slug: post.slug,
    excerpt: post.excerpt,
    coverUrl: post.coverUrl,
    publishedAt: post.publishedAt,
    source: post.source || "managed",
  }));
  res.json({ items });
});

app.get("/api/public/posts/:slug", (req, res) => {
  const post =
    getPublishedPostBySlug(req.params.slug) || getStaticPostBySlug(req.params.slug);
  if (!post) {
    res.status(404).json({ error: "post_not_found" });
    return;
  }
  res.json({ post });
});

app.post("/api/forms/submit", (req, res) => {
  const body = req.body || {};
  const name = String(body.name || "").trim();
  const company = String(body.companyName || body.company || "").trim();
  const phone = String(body.phone || "").trim();
  const position = String(body.position || "").trim();
  const message = String(body.demand || body.message || "").trim();
  const source = String(body.source || "官网表单").trim();

  if (!name || !company || !phone) {
    res.status(400).json({ ok: false, error: "name_company_phone_required" });
    return;
  }

  const submission = addSubmission({
    name,
    company,
    phone,
    position,
    message,
    source,
    payload: body,
  });

  res.json({ ok: true, submissionId: submission.id });
});

app.get("/admin/login", (req, res) => {
  res.render("admin/login", {
    error: "",
    next: req.query.next || "/admin",
  });
});

app.post("/admin/login", (req, res) => {
  const password = String(req.body.password || "");
  const next = String(req.body.next || "/admin");
  if (password !== ADMIN_PASSWORD) {
    res.status(401).render("admin/login", {
      error: "密码错误，请重试。",
      next,
    });
    return;
  }
  req.session.admin = { loggedInAt: new Date().toISOString() };
  res.redirect(next);
});

app.post("/admin/logout", requireAdmin, (req, res) => {
  req.session.destroy(() => {
    res.redirect("/admin/login");
  });
});

app.get("/admin", requireAdmin, (req, res) => {
  const posts = getMergedAllPostsForAdmin();
  const submissions = getSubmissions();
  res.render("admin/dashboard", {
    stats: {
      postCount: posts.length,
      publishedCount: posts.filter((post) => post.status === "published").length,
      submissionCount: submissions.length,
      latestSubmission: submissions[0] || null,
    },
    formatDatetime,
  });
});

app.get("/admin/brand", requireAdmin, (req, res) => {
  res.render("admin/brand", {
    brand: getBrand(),
    saved: req.query.saved === "1",
  });
});

app.post("/admin/brand", requireAdmin, (req, res) => {
  updateBrand(req.body || {});
  res.redirect("/admin/brand?saved=1");
});

app.get("/admin/posts", requireAdmin, (req, res) => {
  res.render("admin/posts", {
    posts: getMergedAllPostsForAdmin(),
    saved: req.query.saved === "1",
    deleted: req.query.deleted === "1",
    imported: req.query.imported === "1",
    formatDatetime,
  });
});

app.post("/admin/posts/import/:slug", requireAdmin, (req, res) => {
  const slug = String(req.params.slug || "");
  const staticPost = getStaticPostBySlug(slug);
  if (!staticPost) {
    res.status(404).send("静态文章不存在");
    return;
  }

  const existing = getPostBySlug(slug);
  if (existing) {
    res.redirect(`/admin/posts/${existing.id}/edit`);
    return;
  }

  const post = savePost({
    title: staticPost.title,
    slug: staticPost.slug,
    excerpt: staticPost.excerpt,
    coverUrl: staticPost.coverUrl,
    content: staticPost.content || staticPost.contentHtml || staticPost.excerpt || "",
    status: "published",
  });

  res.redirect(`/admin/posts/${post.id}/edit?imported=1`);
});

app.get("/admin/posts/new", requireAdmin, (req, res) => {
  res.render("admin/post-form", {
    post: {
      id: "",
      title: "",
      slug: "",
      excerpt: "",
      coverUrl: "",
      content: "",
      status: "draft",
    },
    isNew: true,
  });
});

app.post("/admin/posts/new", requireAdmin, (req, res) => {
  savePost(req.body || null);
  res.redirect("/admin/posts?saved=1");
});

app.get("/admin/posts/:id/edit", requireAdmin, (req, res) => {
  const post = getPostById(req.params.id);
  if (!post) {
    res.status(404).send("文章不存在");
    return;
  }
  res.render("admin/post-form", { post, isNew: false });
});

app.post("/admin/posts/:id/edit", requireAdmin, (req, res) => {
  const post = getPostById(req.params.id);
  if (!post) {
    res.status(404).send("文章不存在");
    return;
  }
  savePost(req.body || {}, post.id);
  res.redirect("/admin/posts?saved=1");
});

app.post("/admin/posts/:id/delete", requireAdmin, (req, res) => {
  deletePost(req.params.id);
  res.redirect("/admin/posts?deleted=1");
});

app.get("/admin/submissions", requireAdmin, (req, res) => {
  res.render("admin/submissions", {
    submissions: getSubmissions(),
    formatDatetime,
  });
});

app.get("/blog/:slug", async (req, res, next) => {
  if (isReservedRoute(req.path)) {
    next();
    return;
  }

  const slug = req.params.slug;
  const managedPost = getPublishedPostBySlug(slug);
  if (managedPost) {
    res.render("public-post", {
      brand: getBrand(),
      post: {
        ...managedPost,
        contentHtml: buildContentHtml(managedPost.content),
      },
      formatDatetime,
    });
    return;
  }

  const staticBlogFile = path.join(SITE_ROOT, "blog", `${slug}.html`);
  if (await exists(staticBlogFile)) {
    await sendSiteHtml(res, staticBlogFile);
    return;
  }
  next();
});

app.get(/.*\.html$/, async (req, res, next) => {
  if (isReservedRoute(req.path)) {
    next();
    return;
  }
  const filePath = resolveSitePath(req.path);
  if (!filePath || !(await exists(filePath))) {
    next();
    return;
  }
  await sendSiteHtml(res, filePath);
});

app.get(/.*/, async (req, res, next) => {
  if (isReservedRoute(req.path)) {
    next();
    return;
  }
  if (hasExtension(req.path)) {
    next();
    return;
  }

  const route = cleanRoutePath(req.path);
  const candidates = [];
  if (route === "/") {
    candidates.push(path.join(SITE_ROOT, "index.html"));
  } else {
    const withoutSlash = route.replace(/^\/+/, "");
    candidates.push(path.join(SITE_ROOT, `${withoutSlash}.html`));
    candidates.push(path.join(SITE_ROOT, withoutSlash, "index.html"));
  }

  for (const candidate of candidates) {
    if (candidate.startsWith(SITE_ROOT) && (await exists(candidate))) {
      await sendSiteHtml(res, candidate);
      return;
    }
  }

  next();
});

app.use(express.static(SITE_ROOT, { index: false, fallthrough: true, maxAge: "7d" }));

app.use((req, res) => {
  res.status(404).type("text/plain").send("404 Not Found");
});

app.listen(PORT, () => {
  console.log(`domesticGEO server running at http://localhost:${PORT}`);
  console.log("admin panel: http://localhost:" + PORT + "/admin");
});
