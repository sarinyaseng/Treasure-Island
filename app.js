(function () {
  const api = new TreasureApi();
  const engine = new IFEngine(api, window.TREASURE_CONFIG);
  const $ = (id) => document.getElementById(id);
  let authMode = "login";

  const views = {
    auth: $("authView"),
    menu: $("menuView"),
    game: $("gameView")
  };
  let mediaPlaybackId = 0;

  document.querySelectorAll("[data-auth-tab]").forEach((tab) => {
    tab.addEventListener("click", () => {
      authMode = tab.dataset.authTab;
      document.querySelectorAll("[data-auth-tab]").forEach((item) => item.classList.toggle("tab-active", item === tab));
      $("authSubmit").textContent = authMode === "login" ? "เริ่มผจญภัย" : "สร้างบัญชี";
    });
  });

  $("authForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const username = $("username").value.trim();
      const password = $("password").value;
      if (authMode === "login") await api.loginUser(username, password);
      else await api.registerUser(username, password);
      showMenu();
    } catch (error) {
      toast(error.message, "alert-error");
    }
  });

  $("demoLogin").addEventListener("click", async () => {
    await api.loginUser(window.TREASURE_CONFIG.demoUsername, "demo");
    showMenu();
  });

  $("continueBtn").addEventListener("click", async () => {
    try {
      const progress = await api.getUserProgress(api.session.username);
      if (!progress) {
        toast("ยังไม่มีข้อมูลบันทึก เริ่มการผจญภัยใหม่", "alert-warning");
        await engine.start("start");
      } else {
        await engine.continueFromSave(progress);
      }
      showView("game");
    } catch (error) {
      toast(error.message, "alert-error");
    }
  });

  $("newGameBtn").addEventListener("click", async () => {
    await engine.start("start");
    showView("game");
  });

  $("logoutBtn").addEventListener("click", () => {
    api.clearSession();
    showView("auth");
  });

  $("menuBtn").addEventListener("click", showMenu);
  $("replayBtn").addEventListener("click", replayScene);
  $("confirmBtn").addEventListener("click", () => engine.confirmChoice().catch((error) => toast(error.message, "alert-error")));
  $("saveBtn").addEventListener("click", () => engine.save().then(() => toast("บันทึกความคืบหน้าแล้ว", "alert-success")).catch((error) => toast(error.message, "alert-error")));
  $("restartBtn").addEventListener("click", async () => {
    $("endingModal").close();
    await engine.start("start");
  });

  engine.addEventListener("scene", ({ detail }) => renderScene(detail.scene, detail.state));
  engine.addEventListener("choice", ({ detail }) => renderSelectedChoice(detail.choice));
  engine.addEventListener("locked", ({ detail }) => renderLockedChoice(detail.choice, detail.state));
  engine.addEventListener("ending", ({ detail }) => renderEnding(detail.scene, detail.state));

  function renderScene(scene, state) {
    $("sceneBackdrop").style.backgroundImage = `url("${scene.background_image}")`;
    $("sceneTitle").textContent = scene.scene_title;
    $("sceneType").textContent = sceneTypeLabel(scene.scene_type);
    $("sceneText").textContent = scene.scene_text;
    $("totalAC").textContent = state.totalAC;
    $("totalMC").textContent = state.totalMC;
    $("totalLPS").textContent = state.totalLPS;
    $("confirmBtn").disabled = true;
    $("saveBtn").disabled = !scene.allow_save;
    $("choicePanel").classList.remove("is-visible", "animate__fadeInUp");
    renderMedia(scene, { initialPlay: true });
    renderChoices();
    lucide.createIcons();
  }

  function renderMedia(scene, options = {}) {
    const initialPlay = options.initialPlay === true;
    const video = $("sceneVideo");
    const image = $("imageScene");
    const playbackId = ++mediaPlaybackId;

    video.pause();
    video.onended = null;
    video.onerror = null;
    video.onloadedmetadata = null;
    video.loop = false;
    video.autoplay = false;
    video.controls = !initialPlay;
    video.removeAttribute("src");
    video.load();
    video.style.display = "none";

    image.style.display = "block";
    image.style.backgroundImage = `url("${scene.background_image}")`;

    if (scene.video_url) {
      video.src = scene.video_url;
      video.style.display = "block";
      image.style.display = "none";

      const finishVideo = () => {
        if (playbackId !== mediaPlaybackId) return;
        video.controls = true;
        revealChoices();
      };

      video.onended = finishVideo;
      video.onerror = finishVideo;
      video.onloadedmetadata = () => {
        if (playbackId !== mediaPlaybackId) return;
        video.currentTime = 0;
        video.play().catch(finishVideo);
      };
      video.load();
    } else {
      window.setTimeout(revealChoices, 480);
    }
  }

  function renderChoices() {
    const container = $("choices");
    container.innerHTML = "";
    const choices = engine.getChoices();
    if (!choices.length) {
      $("confirmBtn").disabled = true;
      return;
    }
    choices.forEach((choice, index) => {
      const button = document.createElement("button");
      button.className = "btn btn-outline choice-btn";
      button.textContent = choice.text;
      button.addEventListener("click", () => engine.selectChoice(index));
      container.appendChild(button);
    });
  }

  function renderSelectedChoice(choice) {
    document.querySelectorAll(".choice-btn").forEach((button, index) => {
      button.classList.toggle("is-selected", index === choice.index);
    });
    $("confirmBtn").disabled = false;
  }

  function renderLockedChoice(choice, state) {
    document.querySelectorAll(".choice-btn").forEach((button, index) => {
      button.classList.add("is-locked");
      button.classList.toggle("is-final", index === choice.index);
    });
    $("confirmBtn").disabled = true;
    $("saveBtn").disabled = true;
    $("totalAC").textContent = state.totalAC;
    $("totalMC").textContent = state.totalMC;
    $("totalLPS").textContent = state.totalLPS;
  }

  function revealChoices() {
    $("choicePanel").classList.add("is-visible", "animate__fadeInUp");
  }

  function replayScene() {
    const scene = engine.state.currentScene;
    renderMedia(scene, { initialPlay: false });
  }

  function renderEnding(scene, state) {
    $("endingTitle").textContent = scene.scene_title;
    $("endingText").textContent = scene.scene_text;
    $("endAC").textContent = state.totalAC;
    $("endMC").textContent = state.totalMC;
    $("endLPS").textContent = state.totalLPS;
    $("endingModal").showModal();
  }

  function showMenu() {
    $("welcomeText").textContent = `ยินดีต้อนรับ ${api.session?.username || "นักเดินทาง"}`;
    showView("menu");
    lucide.createIcons();
  }

  function showView(name) {
    Object.entries(views).forEach(([key, element]) => element.classList.toggle("hidden", key !== name));
  }

  function sceneTypeLabel(type) {
    return {
      NAR: "ฉากเล่าเรื่อง",
      CTQ: "คำถามการคิดเชิงวิพากษ์",
      CT2: "คำถามเหตุผลระดับที่ 2",
      DAH: "คำใบ้และการช่วยเหลือ",
      END: "ตอนจบ"
    }[type] || type;
  }

  function toast(message, type = "alert-info") {
    const alert = document.createElement("div");
    alert.className = `alert ${type}`;
    alert.textContent = message;
    $("toast").appendChild(alert);
    window.setTimeout(() => alert.remove(), 3200);
  }

  if (api.session) showMenu();
  lucide.createIcons();
})();
