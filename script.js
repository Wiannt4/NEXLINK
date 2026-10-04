(() => {
  "use strict";

  const THEME_KEY = "nexlink-theme-v1";
  const defaultProfile = () => ({
    name: "Nama Kamu",
    username: "namakamu",
    bio: "Selamat datang di halaman saya ✨",
    avatar: "",
    background: "violet",
    customBackgroundColor: "#7044c7",
    profileTheme: "orchid",
    analytics: { views: 0, clicks: {} },
    pinnedLinkId: "",
    links: []
  });

  function readStorage(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch (error) {
      console.error(`Tidak dapat membaca ${key} dari LocalStorage.`, error);
      return fallback;
    }
  }

  let profile = defaultProfile();
  let saveQueue = Promise.resolve();
  let profileSaveTimer;

  async function apiRequest(url, options = {}) {
    const response = await fetch(url, {
      credentials: "same-origin",
      ...options,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) }
    });
    if (response.status === 204) return null;
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(result.error || "Permintaan gagal. Coba lagi.");
      error.status = response.status;
      throw error;
    }
    return result;
  }

  async function saveProfile(showError = true) {
    const snapshot = JSON.stringify({
      name: profile.name,
      username: profile.username,
      bio: profile.bio,
      avatar: profile.avatar,
      background: profile.background,
      customBackgroundColor: profile.customBackgroundColor,
      profileTheme: profile.profileTheme,
      pinnedLinkId: profile.pinnedLinkId,
      links: profile.links
    });
    saveQueue = saveQueue.catch(() => {}).then(async () => {
      const result = await apiRequest("/api/profile", { method: "PUT", body: snapshot });
      profile.analytics = result.profile.analytics;
      return true;
    }).catch(error => {
      console.error("Gagal menyimpan profil.", error);
      if (showError) toast(error.message || "Profil tidak dapat disimpan. Periksa koneksi.", "error");
      return false;
    });
    return saveQueue;
  }

  function scheduleProfileSave() {
    window.clearTimeout(profileSaveTimer);
    profileSaveTimer = window.setTimeout(() => {
      void saveProfile();
    }, 350);
  }

  function toast(message, type = "success") {
    let region = document.getElementById("toast-region");
    if (!region) {
      region = document.createElement("div");
      region.id = "toast-region";
      region.className = "toast-region";
      region.setAttribute("aria-live", "polite");
      document.body.append(region);
    }
    const item = document.createElement("div");
    item.className = `toast ${type}`;
    item.textContent = message;
    region.append(item);
    window.setTimeout(() => item.remove(), 3200);
  }

  function normalizeUrl(value) {
    try {
      const url = new URL(value);
      if (url.protocol !== "http:" && url.protocol !== "https:") return null;
      return url.href;
    } catch {
      return null;
    }
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[character]);
  }

  function initials(name) {
    return (name || "N").trim().slice(0, 1).toUpperCase() || "N";
  }

  function orderedLinks(links = profile.links) {
    return [...links].sort((left, right) => {
      if (left.id === profile.pinnedLinkId) return -1;
      if (right.id === profile.pinnedLinkId) return 1;
      return 0;
    });
  }

  function avatarMarkup(className) {
    const image = profile.avatar
      ? `<img src="${escapeHtml(profile.avatar)}" alt="Foto profil ${escapeHtml(profile.name)}">`
      : escapeHtml(initials(profile.name));
    return `<div class="${className}">${image}</div>`;
  }

  function socialLinks() {
    const socialItems = [
      { key: "instagram.com", label: "ig", name: "Instagram" },
      { key: "tiktok.com", label: "tk", name: "TikTok" },
      { key: "youtube.com", label: "yt", name: "YouTube" },
      { key: "github.com", label: "gh", name: "GitHub" }
    ];
    return socialItems.map(social => {
      const match = profile.links.find(link => link.active && link.url.toLowerCase().includes(social.key));
      return match
        ? `<a href="${escapeHtml(match.url)}" target="_blank" rel="noopener noreferrer" aria-label="${social.name}" data-analytics-link="${escapeHtml(match.id)}">${social.label}</a>`
        : `<span class="social-placeholder" aria-label="${social.name}">${social.label}</span>`;
    }).join("");
  }

  function cardMarkup(includeActions = true) {
    const visibleLinks = orderedLinks().filter(link => link.active);
    const linksMarkup = visibleLinks.length
      ? visibleLinks.map(link => `<a class="public-link-button" href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer" data-analytics-link="${escapeHtml(link.id)}"><span>${escapeHtml(link.title)}${link.id === profile.pinnedLinkId ? " <span class=\"pinned-mark\" aria-label=\"Pinned\">◆</span>" : ""}</span><span aria-hidden="true">↗</span></a>`).join("")
      : `<div class="empty-links">Belum ada link aktif.<br>Tambahkan link lewat dashboard.</div>`;
    return `${avatarMarkup("public-avatar")}
      <h1 class="public-name">${escapeHtml(profile.name || "Nama Kamu")}</h1>
      <p class="public-username">@${escapeHtml(profile.username || "namakamu")}</p>
      <p class="public-bio">${escapeHtml(profile.bio || "")}</p>
      <div class="public-links">${linksMarkup}</div>
      <div class="public-socials">${socialLinks()}</div>
      ${includeActions ? `<div class="public-actions"><button class="public-action-button" type="button" data-profile-share>↗ &nbsp; Share</button><button class="public-action-button" type="button" data-profile-copy>⧉ &nbsp; Copy link</button></div>` : ""}
      <p class="public-branding">Made with <b>NEXLINK</b></p>`;
  }

  function publicUrl() {
    return new URL(`/u/${encodeURIComponent(profile.username)}`, window.location.origin).href;
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        try {
          await navigator.clipboard.writeText(text);
          toast("Link profil berhasil disalin.");
          return;
        } catch (error) {
          console.warn("Clipboard API tidak tersedia, mencoba salin alternatif.", error);
        }
      }
      const temporary = document.createElement("textarea");
      temporary.value = text;
      temporary.style.position = "fixed";
      temporary.style.opacity = "0";
      document.body.append(temporary);
      let copied;
      try {
        temporary.select();
        copied = document.execCommand("copy");
      } finally {
        temporary.remove();
      }
      if (!copied) throw new Error("Browser menolak operasi salin.");
      toast("Link profil berhasil disalin.");
    } catch (error) {
      console.error("Gagal menyalin link profil.", error);
      toast("Tidak dapat menyalin link. Silakan salin URL dari address bar.", "error");
    }
  }

  async function shareProfile() {
    const shareData = { title: `${profile.name} — NEXLINK`, text: profile.bio, url: publicUrl() };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (error) {
        if (error.name !== "AbortError") {
          console.error("Gagal membagikan profil.", error);
          toast("Profil tidak dapat dibagikan.", "error");
        }
      }
    } else {
      await copyText(publicUrl());
    }
  }

  function applyTheme() {
    const isLight = localStorage.getItem(THEME_KEY) === "light";
    document.body.classList.toggle("light-mode", isLight);
  }

  function setupTheme() {
    applyTheme();
    document.querySelectorAll("[data-theme-toggle]").forEach(button => {
      button.addEventListener("click", () => {
        const next = document.body.classList.contains("light-mode") ? "dark" : "light";
        localStorage.setItem(THEME_KEY, next);
        applyTheme();
      });
    });
  }

  function setupPasswordToggles() {
    document.querySelectorAll("[data-password-toggle]").forEach(button => {
      button.addEventListener("click", () => {
        const input = document.getElementById(button.dataset.passwordToggle);
        if (!input) return;
        const isHidden = input.type === "password";
        input.type = isHidden ? "text" : "password";
        button.textContent = isHidden ? "Sembunyi" : "Lihat";
        button.setAttribute("aria-label", isHidden ? "Sembunyikan password" : "Tampilkan password");
      });
    });
  }

  function setupAuth() {
    const loginForm = document.getElementById("login-form");
    if (loginForm) {
      loginForm.addEventListener("submit", async event => {
        event.preventDefault();
        const data = new FormData(loginForm);
        const email = String(data.get("email") || "").trim().toLowerCase();
        const password = String(data.get("password") || "");
        try {
          await apiRequest("/api/auth/login", {
            method: "POST",
            body: JSON.stringify({ email, password })
          });
        } catch (error) {
          const legacyUser = readStorage("nexlink-user-v1", null);
          const legacyProfile = readStorage("nexlink-profile-v1", null);
          if (error.status === 401 && legacyUser?.email === email && legacyUser.password === password && legacyProfile) {
            try {
              await apiRequest("/api/auth/register", {
                method: "POST",
                body: JSON.stringify({ username: legacyUser.username, email, password })
              });
              profile = {
                ...defaultProfile(),
                ...legacyProfile,
                username: legacyUser.username,
                links: Array.isArray(legacyProfile.links) ? legacyProfile.links : [],
                analytics: defaultProfile().analytics
              };
              const migrated = await saveProfile(false);
              if (migrated) {
                localStorage.removeItem("nexlink-user-v1");
                localStorage.removeItem("nexlink-profile-v1");
              } else {
                toast("Akun berhasil dipindahkan. Profil lama belum tersalin, silakan periksa dashboard.", "error");
              }
            } catch (migrationError) {
              toast(migrationError.message || "Login gagal. Periksa email dan password.", "error");
              return;
            }
          } else {
            toast(error.message || "Login gagal. Periksa koneksi.", "error");
            return;
          }
        }
        window.location.href = "dashboard.html";
      });
    }

    const registerForm = document.getElementById("register-form");
    if (registerForm) {
      registerForm.addEventListener("submit", async event => {
        event.preventDefault();
        const data = new FormData(registerForm);
        const username = String(data.get("username") || "").trim().replace(/^@/, "");
        const email = String(data.get("email") || "").trim().toLowerCase();
        const password = String(data.get("password") || "");
        const confirm = String(data.get("confirm") || "");
        if (password !== confirm) {
          toast("Konfirmasi password belum cocok.", "error");
          document.getElementById("register-confirm").focus();
          return;
        }
        try {
          await apiRequest("/api/auth/register", {
            method: "POST",
            body: JSON.stringify({ username, email, password })
          });
          window.location.href = "dashboard.html";
        } catch (error) {
          toast(error.message || "Akun tidak dapat dibuat. Periksa koneksi.", "error");
        }
      });
    }
  }

  function renderEditorAvatar() {
    const target = document.getElementById("editor-avatar");
    if (!target) return;
    target.innerHTML = profile.avatar
      ? `<img src="${escapeHtml(profile.avatar)}" alt="Foto profil">`
      : escapeHtml(initials(profile.name));
  }

  function renderLinks() {
    const list = document.getElementById("links-list");
    if (!list) return;
    document.getElementById("link-count").textContent = `${profile.links.length} link`;
    if (!profile.links.length) {
      list.innerHTML = `<div class="empty-links">Belum ada link. Tambahkan link pertamamu di bawah.</div>`;
      return;
    }
    list.innerHTML = orderedLinks().map(link => `<article class="link-item ${link.active ? "" : "is-disabled"} ${link.id === profile.pinnedLinkId ? "is-pinned" : ""}" draggable="true" data-link-id="${escapeHtml(link.id)}">
      <span class="drag-handle" aria-label="Seret untuk mengurutkan">⠿</span>
      <div class="link-item-content"><div class="link-item-title">${escapeHtml(link.title)}${link.id === profile.pinnedLinkId ? " <span class=\"pinned-label\">PINNED</span>" : ""}</div><div class="link-item-url">${escapeHtml(link.url)}</div></div>
      <div class="link-item-actions">
        <button class="toggle-switch" type="button" role="switch" aria-checked="${link.active}" aria-label="${link.active ? "Nonaktifkan" : "Aktifkan"} ${escapeHtml(link.title)}" data-action="toggle"></button>
        <button class="icon-button pin-button" type="button" aria-label="${link.id === profile.pinnedLinkId ? "Lepas pin" : "Pin"} ${escapeHtml(link.title)}" aria-pressed="${link.id === profile.pinnedLinkId}" data-action="pin">◆</button>
        <button class="icon-button" type="button" aria-label="Edit ${escapeHtml(link.title)}" data-action="edit">✎</button>
        <button class="icon-button delete" type="button" aria-label="Hapus ${escapeHtml(link.title)}" data-action="delete">×</button>
      </div>
    </article>`).join("");
  }

  function applyProfileTheme(target) {
    if (target) target.dataset.profileTheme = profile.profileTheme;
  }

  function applyBackground(target) {
    if (!target) return;
    target.dataset.background = profile.background;
    if (profile.background === "custom") {
      const color = profile.customBackgroundColor;
      target.style.background = `radial-gradient(ellipse at 50% 20%, ${color}, #0b0a10 82%)`;
    } else {
      target.style.removeProperty("background");
    }
  }

  function renderAnalytics() {
    const views = document.getElementById("profile-views-count");
    if (!views) return;
    const clickCounts = profile.analytics.clicks;
    const totalClicks = Object.values(clickCounts).reduce((total, count) =>
      total + (Number.isFinite(count) ? Math.max(0, count) : 0), 0);
    views.textContent = String(profile.analytics.views);
    document.getElementById("profile-clicks-count").textContent = String(totalClicks);
    const list = document.getElementById("analytics-links");
    list.innerHTML = orderedLinks().length
      ? orderedLinks().map(link => `<div class="analytics-link-row"><span>${escapeHtml(link.title)}</span><strong>${Number(clickCounts[link.id]) || 0}</strong></div>`).join("")
      : `<p class="field-hint analytics-empty">Klik link akan muncul di sini setelah pengunjung membuka profile.</p>`;
  }

  function renderQrCode() {
    const target = document.getElementById("profile-qr");
    if (!target) return;
    target.replaceChildren();
    if (!window.QRCode) {
      target.textContent = "QR Code memerlukan koneksi internet saat pertama kali dimuat.";
      return;
    }
    new window.QRCode(target, {
      text: publicUrl(),
      width: 150,
      height: 150,
      colorDark: "#17141f",
      colorLight: "#ffffff",
      correctLevel: window.QRCode.CorrectLevel.H
    });
  }

  function renderPreview() {
    const target = document.getElementById("preview-profile");
    if (target) {
      target.innerHTML = cardMarkup(true);
      applyProfileTheme(target);
    }
    const frame = document.getElementById("preview-frame");
    applyBackground(frame);
    document.querySelectorAll(".background-swatch").forEach(button => {
      button.classList.toggle("active", button.dataset.background === profile.background);
    });
    document.querySelectorAll(".theme-swatch").forEach(button => {
      button.classList.toggle("active", button.dataset.profileTheme === profile.profileTheme);
    });
    const colorPicker = document.getElementById("custom-background-color");
    if (colorPicker) colorPicker.value = profile.customBackgroundColor;
    renderQrCode();
    renderAnalytics();
  }

  function renderDashboard() {
    const nameInput = document.getElementById("profile-name");
    if (!nameInput) return;
    nameInput.value = profile.name;
    document.getElementById("profile-username").value = profile.username;
    document.getElementById("profile-bio").value = profile.bio;
    document.getElementById("bio-count").textContent = `${profile.bio.length} / 160`;
    renderEditorAvatar();
    renderLinks();
    renderPreview();
  }

  async function setupDashboard() {
    const nameInput = document.getElementById("profile-name");
    if (!nameInput) return;
    try {
      await apiRequest("/api/auth/me");
      const result = await apiRequest("/api/profile");
      profile = result.profile;
    } catch (error) {
      if (error.status === 401) {
        window.location.replace("login.html");
        return;
      }
      console.error("Dashboard gagal memuat data profil.", error);
      toast(error.message || "Profil tidak dapat dimuat dari server.", "error");
      return;
    }
    let profileSavedToast;
    const updateText = () => {
      profile.name = nameInput.value.trim() || "Nama Kamu";
      profile.username = document.getElementById("profile-username").value.trim().replace(/^@/, "").toLowerCase() || "namakamu";
      profile.bio = document.getElementById("profile-bio").value;
      document.getElementById("bio-count").textContent = `${profile.bio.length} / 160`;
      renderEditorAvatar();
      renderPreview();
      scheduleProfileSave();
      window.clearTimeout(profileSavedToast);
      profileSavedToast = window.setTimeout(async () => {
        if (await saveQueue) toast("Profile berhasil disimpan.");
      }, 900);
    };
    ["profile-name", "profile-username", "profile-bio"].forEach(id => {
      document.getElementById(id).addEventListener("input", updateText);
    });

    document.getElementById("avatar-upload").addEventListener("change", event => {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        toast("Pilih file gambar yang valid.", "error");
        event.target.value = "";
        return;
      }
      if (file.size > 2 * 1024 * 1024) {
        toast("Ukuran foto maksimal 2 MB.", "error");
        event.target.value = "";
        return;
      }
      const reader = new FileReader();
      reader.addEventListener("load", () => {
        profile.avatar = String(reader.result);
        void saveProfile().then(saved => {
          if (!saved) return;
          renderEditorAvatar();
          renderPreview();
          toast("Foto profil berhasil diperbarui.");
        });
      });
      reader.addEventListener("error", () => toast("Foto tidak dapat dibaca.", "error"));
      reader.readAsDataURL(file);
    });

    document.getElementById("link-form").addEventListener("submit", async event => {
      event.preventDefault();
      const titleInput = document.getElementById("link-title");
      const urlInput = document.getElementById("link-url");
      const url = normalizeUrl(urlInput.value.trim());
      if (!url) {
        toast("URL harus menggunakan http:// atau https://.", "error");
        urlInput.focus();
        return;
      }
      profile.links.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, title: titleInput.value.trim(), url, active: true });
      if (!await saveProfile()) {
        profile.links.pop();
        return;
      }
      renderLinks();
      renderPreview();
      event.target.reset();
      titleInput.focus();
      toast("Link berhasil ditambahkan.");
    });

    document.getElementById("links-list").addEventListener("click", async event => {
      const button = event.target.closest("[data-action]");
      if (!button) return;
      const item = button.closest("[data-link-id]");
      const link = profile.links.find(entry => entry.id === item.dataset.linkId);
      if (!link) return;
      if (button.dataset.action === "toggle") {
        link.active = !link.active;
        if (!await saveProfile()) {
          link.active = !link.active;
          return;
        }
        renderLinks();
        renderPreview();
        toast(link.active ? "Link diaktifkan." : "Link dinonaktifkan.");
      } else if (button.dataset.action === "pin") {
        const previousPinnedId = profile.pinnedLinkId;
        profile.pinnedLinkId = profile.pinnedLinkId === link.id ? "" : link.id;
        if (!await saveProfile()) {
          profile.pinnedLinkId = previousPinnedId;
          return;
        }
        renderLinks();
        renderPreview();
        toast(profile.pinnedLinkId ? "Link berhasil dipin di posisi teratas." : "Pin link dilepas.");
      } else if (button.dataset.action === "delete") {
        const previousLinks = profile.links;
        const previousPinnedId = profile.pinnedLinkId;
        profile.links = profile.links.filter(entry => entry.id !== link.id);
        if (profile.pinnedLinkId === link.id) profile.pinnedLinkId = "";
        if (!await saveProfile()) {
          profile.links = previousLinks;
          profile.pinnedLinkId = previousPinnedId;
          return;
        }
        renderLinks();
        renderPreview();
        toast("Link dihapus.");
      } else if (button.dataset.action === "edit") {
        const title = window.prompt("Edit judul link:", link.title);
        if (title === null) return;
        const urlValue = window.prompt("Edit URL link:", link.url);
        if (urlValue === null) return;
        const url = normalizeUrl(urlValue.trim());
        if (!title.trim() || !url) {
          toast("Judul dan URL valid wajib diisi.", "error");
          return;
        }
        const previousTitle = link.title;
        const previousUrl = link.url;
        link.title = title.trim().slice(0, 50);
        link.url = url;
        if (!await saveProfile()) {
          link.title = previousTitle;
          link.url = previousUrl;
          return;
        }
        renderLinks();
        renderPreview();
        toast("Link berhasil diperbarui.");
      }
    });

    const linksList = document.getElementById("links-list");
    let draggedId = null;
    linksList.addEventListener("dragstart", event => {
      const item = event.target.closest("[data-link-id]");
      if (!item) return;
      draggedId = item.dataset.linkId;
      item.classList.add("dragging");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", draggedId);
    });
    linksList.addEventListener("dragend", event => {
      const item = event.target.closest("[data-link-id]");
      if (item) item.classList.remove("dragging");
      draggedId = null;
    });
    linksList.addEventListener("dragover", event => {
      const target = event.target.closest("[data-link-id]");
      if (!target || !draggedId || target.dataset.linkId === draggedId) return;
      event.preventDefault();
    });
    linksList.addEventListener("drop", async event => {
      const target = event.target.closest("[data-link-id]");
      if (!target || !draggedId || target.dataset.linkId === draggedId) return;
      event.preventDefault();
      const reorderedLinks = orderedLinks();
      const fromIndex = reorderedLinks.findIndex(link => link.id === draggedId);
      const toIndex = reorderedLinks.findIndex(link => link.id === target.dataset.linkId);
      if (fromIndex < 0 || toIndex < 0) return;
      const [moved] = reorderedLinks.splice(fromIndex, 1);
      reorderedLinks.splice(toIndex, 0, moved);
      const previousLinks = profile.links;
      profile.links = reorderedLinks;
      if (!await saveProfile()) {
        profile.links = previousLinks;
        renderLinks();
        return;
      }
      renderLinks();
      renderPreview();
      toast("Urutan link berhasil diperbarui.");
    });

    document.querySelectorAll(".background-swatch").forEach(button => {
      button.addEventListener("click", async () => {
        profile.background = button.dataset.background;
        renderPreview();
        if (await saveProfile()) toast("Background berhasil diperbarui.");
      });
    });

    document.querySelectorAll(".theme-swatch").forEach(button => {
      button.addEventListener("click", async () => {
        profile.profileTheme = button.dataset.profileTheme;
        renderPreview();
        if (await saveProfile()) toast("Tema profil berhasil diperbarui.");
      });
    });
    document.getElementById("custom-background-color").addEventListener("input", event => {
      profile.background = "custom";
      profile.customBackgroundColor = event.target.value;
      void saveProfile();
      renderPreview();
    });
    document.getElementById("custom-background-color").addEventListener("change", () => {
      void saveQueue.then(saved => {
        if (saved) toast("Warna background berhasil disimpan.");
      });
    });
    document.getElementById("copy-profile-button").addEventListener("click", () => copyText(publicUrl()));
    document.getElementById("preview-column").addEventListener("click", event => {
      if (event.target.closest("[data-profile-copy]")) copyText(publicUrl());
      if (event.target.closest("[data-profile-share]")) shareProfile();
    });
    document.querySelectorAll("[data-share-profile]").forEach(button => {
      button.addEventListener("click", shareProfile);
    });
    document.getElementById("preview-mode-toggle").addEventListener("click", event => {
      const shell = document.querySelector(".dashboard-shell");
      const isPreview = shell.classList.toggle("is-preview-mode");
      event.currentTarget.innerHTML = isPreview ? "← Kembali ke dashboard" : "Preview <span>↗</span>";
      if (isPreview) window.scrollTo({ top: 0, behavior: "smooth" });
    });
    document.getElementById("download-qr-button").addEventListener("click", () => {
      const qr = document.querySelector("#profile-qr canvas");
      if (!qr) {
        toast("QR Code belum tersedia. Periksa koneksi internet lalu muat ulang.", "error");
        return;
      }
      const anchor = document.createElement("a");
      anchor.download = `${profile.username || "nexlink"}-qr.png`;
      anchor.href = qr.toDataURL("image/png");
      anchor.click();
      toast("QR Code berhasil diunduh.");
    });
    document.getElementById("logout-button").addEventListener("click", async () => {
      try {
        await apiRequest("/api/auth/logout", { method: "POST" });
      } catch (error) {
        console.error("Logout server gagal.", error);
        toast(error.message || "Logout gagal. Coba lagi.", "error");
        return;
      }
      window.location.href = "index.html";
    });
    renderDashboard();
    renderQrCode();
  }

  async function setupPublicProfile() {
    const profileTarget = document.getElementById("public-profile");
    if (!profileTarget) return;
    const page = document.querySelector(".public-page");
    let publicUsername = window.location.pathname.match(/^\/u\/([^/]+)\/?$/)?.[1] || new URLSearchParams(window.location.search).get("username") || "";
    try {
      publicUsername = decodeURIComponent(publicUsername);
    } catch {
      publicUsername = "";
    }
    if (!publicUsername) {
      profileTarget.innerHTML = `<p class="empty-links">Profil tidak ditemukan.</p>`;
      return;
    }
    try {
      const result = await apiRequest(`/api/profiles/${encodeURIComponent(publicUsername)}`);
      profile = result.profile;
    } catch (error) {
      profileTarget.innerHTML = `<p class="empty-links">${escapeHtml(error.message || "Profil tidak dapat dimuat.")}</p>`;
      return;
    }
    profileTarget.innerHTML = cardMarkup(true);
    applyProfileTheme(profileTarget);
    applyBackground(page);
    document.title = `${profile.name} (@${profile.username}) — NEXLINK`;
    page.addEventListener("click", async event => {
      const link = event.target.closest("[data-analytics-link]");
      if (link) {
        const endpoint = `/api/profiles/${encodeURIComponent(profile.username)}/links/${encodeURIComponent(link.dataset.analyticsLink)}/click`;
        void fetch(endpoint, {
          method: "POST",
          credentials: "same-origin",
          keepalive: true,
          headers: { "Content-Type": "application/json" },
          body: "{}"
        }).then(response => {
          if (!response.ok) throw new Error(`Analytics request gagal (${response.status}).`);
        }).catch(error => console.error("Link click tidak dapat dicatat.", error));
      }
      const copyButton = event.target.closest("[data-profile-copy]");
      const shareButton = event.target.closest("[data-profile-share]");
      if (copyButton) await copyText(publicUrl());
      if (shareButton) await shareProfile();
    });
  }

  setupTheme();
  setupPasswordToggles();
  setupAuth();
  void setupDashboard();
  void setupPublicProfile();
})();
