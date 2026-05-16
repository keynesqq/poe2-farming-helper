(function () {
  // State
  let questData = [];
  let checkedState = {};
  let editMode = false;
  let collapsedActs = new Set();
  let collapsedMaps = new Set();
  let showCompletedTasks = new Set();
  let showCompletedMaps = new Set();
  let manuallyExpandedActs = new Set();
  let manuallyExpandedMaps = new Set();
  let localEditActs = new Set();
  let localEditMaps = new Set();

  // Drag state
  let draggedMapIndex = null;
  let draggedTaskIndex = null;
  let dragSourceMapIdx = null;

  // Modal
  const modal = document.getElementById("editModal");
  const modalTitle = document.getElementById("modalTitle");
  const modalFields = document.getElementById("modalFields");
  let modalCallback = null;

  // Image Viewer
  const imageViewer = document.getElementById("imageViewer");
  const imageViewerImg = document.getElementById("imageViewerImg");
  const imageViewerTitle = document.getElementById("imageViewerTitle");
  let imageScale = 1;
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let imageOffsetX = 0;
  let imageOffsetY = 0;

  // Storage keys
  const STORAGE_DATA_KEY = "poe2_final_data";
  const STORAGE_CHECK_KEY = "poe2_final_checked";
  const STORAGE_THEME_KEY = "poe2_theme";
  const STORAGE_EDIT_KEY = "poe2_edit_mode";

  // Transform data.json structure to app structure
  function transformData(rawData) {
    return rawData.map((chapter, chapterIdx) => ({
      act: chapter.chapter,
      bossStrategy: chapter.chapter_strategy || "",
      chapterBoss: chapter.chapter_boss || "",
      images: [],
      mapUrl: chapter.mapUrl || [],
      maps: (chapter.areas || []).map((area, areaIdx) => {
        // 组合繁体中文 / 简体中文名称
        const mapName = area.name_cn
          ? `${area.name_tw || area.name_en} / ${area.name_cn}`
          : area.name_tw || area.name_en || "未知区域";
        const level = area.level || 0;
        const mapStrategy = area.exploration_notes || "";

        const entries = area.entries || [];
        const tasks = entries.map((entry, taskIdx) => {
          const result = {
            id: `c${chapterIdx + 1}m${areaIdx + 1}t${taskIdx + 1}`,
            description: entry.name || "未命名",
            tags: [],
            rewardTags: entry.rewards || [],
          };

          // 将 priority 作为标签
          if (entry.priority) {
            result.tags = [entry.priority];
          }

          return result;
        });

        return {
          mapName: mapName,
          level: level,
          mapStrategy: mapStrategy,
          tasks: tasks,
          images: [],
          mapUrl: area.mapUrl || [],
          id: `c${chapterIdx + 1}m${areaIdx + 1}`,
        };
      }),
    }));
  }

  // Data functions
  async function loadData() {
    try {
      const stored = localStorage.getItem(STORAGE_DATA_KEY);
      if (stored) {
        questData = JSON.parse(stored);
      } else {
        const response = await fetch("data.json");
        const rawData = await response.json();
        // 新的数据结构：{ poe2BD: [], act: [...] }
        questData = transformData(rawData.act || rawData);
      }
    } catch (e) {
      console.error("Failed to load data:", e);
      questData = [];
    }
    try {
      checkedState = JSON.parse(localStorage.getItem(STORAGE_CHECK_KEY)) || {};
    } catch (e) {
      checkedState = {};
    }
    // Restore theme
    try {
      if (localStorage.getItem(STORAGE_THEME_KEY) === "light") {
        document.getElementById("themeCheckbox").checked = true;
        document.body.classList.add("light-theme");
      }
    } catch (e) {}
    // Restore edit mode (checkbox已删除，只恢复状态)
    try {
      if (localStorage.getItem(STORAGE_EDIT_KEY) === "true") {
        editMode = true;
      }
    } catch (e) {}
  }

  function saveData() {
    try {
      localStorage.setItem(STORAGE_DATA_KEY, JSON.stringify(questData));
    } catch (e) {}
  }

  function saveChecks() {
    try {
      localStorage.setItem(STORAGE_CHECK_KEY, JSON.stringify(checkedState));
    } catch (e) {}
  }

  function generateId() {
    return (
      "id_" + Date.now() + "_" + Math.random().toString(36).substring(2, 10)
    );
  }

  // Auto collapse functions
  function applyInitialAutoCollapse() {
    questData.forEach((act, actIdx) => {
      const allTasks = act.maps.flatMap((m) => m.tasks);
      if (allTasks.length > 0 && allTasks.every((t) => checkedState[t.id])) {
        collapsedActs.add(actIdx);
      }
      act.maps.forEach((map, mapIdx) => {
        const mapKey = `${actIdx}_${mapIdx}`;
        if (
          map.tasks.length > 0 &&
          map.tasks.every((t) => checkedState[t.id])
        ) {
          collapsedMaps.add(mapKey);
        }
      });
    });
  }

  function applySmartAutoCollapse() {
    questData.forEach((act, actIdx) => {
      const allTasks = act.maps.flatMap((m) => m.tasks);
      if (
        allTasks.length > 0 &&
        allTasks.every((t) => checkedState[t.id]) &&
        !manuallyExpandedActs.has(actIdx)
      ) {
        collapsedActs.add(actIdx);
      }
      act.maps.forEach((map, mapIdx) => {
        const mapKey = `${actIdx}_${mapIdx}`;
        if (
          map.tasks.length > 0 &&
          map.tasks.every((t) => checkedState[t.id]) &&
          !manuallyExpandedMaps.has(mapKey)
        ) {
          collapsedMaps.add(mapKey);
        }
      });
    });
  }

  // Modal functions
  function showModal(title, fields, callback) {
    modalTitle.textContent = title;
    modalFields.innerHTML = "";

    fields.forEach((f) => {
      const label = document.createElement("label");
      label.textContent = f.label;
      label.setAttribute("for", f.id);
      modalFields.appendChild(label);

      if (f.type === "select") {
        const sel = document.createElement("select");
        sel.id = f.id;
        f.options.forEach((o) => {
          const opt = document.createElement("option");
          opt.value = o.value;
          opt.textContent = o.text;
          if (o.value === f.value) opt.selected = true;
          sel.appendChild(opt);
        });
        modalFields.appendChild(sel);
      } else if (f.type === "textarea") {
        const ta = document.createElement("textarea");
        ta.id = f.id;
        ta.value = f.value || "";
        if (f.placeholder) ta.placeholder = f.placeholder;
        modalFields.appendChild(ta);
      } else {
        const inp = document.createElement("input");
        inp.type = f.type || "text";
        inp.id = f.id;
        inp.value = f.value || "";
        if (f.placeholder) inp.placeholder = f.placeholder;
        modalFields.appendChild(inp);
      }

      // 为地图名输入框添加提示
      if (f.id === "mapName") {
        const hint = document.createElement("div");
        hint.style.fontSize = "12px";
        hint.style.color = "#999";
        hint.style.marginTop = "4px";
        hint.style.marginBottom = "12px";
        hint.textContent = "请保持地图名与游戏内地图名一致";
        modalFields.appendChild(hint);
      }
    });

    modal.classList.remove("hidden");
    modalCallback = callback;
    // 强制主窗口获取焦点，解决录屏软件抢焦点导致输入框无法使用
    if (window.electronAPI?.focusMainWindow) {
      window.electronAPI.focusMainWindow();
    }
    // 增强 focus 重试机制：录屏软件可能会反复抢焦点
    let focusAttempts = 0;
    const tryFocus = () => {
      const firstInput = modalFields.querySelector("input, textarea, select");
      if (firstInput) {
        firstInput.focus();
        // 如果焦点不在当前输入框且未达到最大重试次数，继续尝试
        if (document.activeElement !== firstInput && focusAttempts < 5) {
          focusAttempts++;
          setTimeout(tryFocus, 150);
        }
      }
    };
    setTimeout(tryFocus, 100);
  }

  function hideModal() {
    modal.classList.add("hidden");
    modalCallback = null;
  }

  // Utility functions
  function calcProgress(tasks) {
    if (!tasks.length) return 0;
    return Math.round(
      (tasks.filter((t) => checkedState[t.id]).length / tasks.length) * 100,
    );
  }

  // 过滤掉空字符串的标签
  function filterNonEmpty(arr) {
    return (arr || []).filter((s) => s && s.trim());
  }

  function updateGlobalProgress() {
    let totalTasks = 0;
    let checkedTasks = 0;
    questData.forEach((act) => {
      act.maps.forEach((map) => {
        totalTasks += map.tasks.length;
        checkedTasks += map.tasks.filter((t) => checkedState[t.id]).length;
      });
    });
    const percent = totalTasks
      ? Math.round((checkedTasks / totalTasks) * 100)
      : 0;
    document.getElementById("globalProgress").value = percent;
    document.getElementById("progressPercent").textContent = percent + "%";
  }

  // 将本地文件路径转换为自定义协议 URL
  function getImageUrl(imgSrc) {
    if (!imgSrc) return "";
    // 如果已经是自定义协议或 data URL，直接返回
    if (imgSrc.startsWith("app-image://") || imgSrc.startsWith("data:")) {
      return imgSrc;
    }
    // 如果是本地文件路径，转换为自定义协议
    if (imgSrc.includes(":/") || imgSrc.startsWith("/")) {
      return "app-image://" + encodeURIComponent(imgSrc);
    }
    return imgSrc;
  }

  // Image Viewer Functions
  function showImageViewer(imageUrl, title) {
    imageViewerImg.src = imageUrl;
    imageViewerTitle.textContent = title || "地图图片";
    imageScale = 1;
    imageOffsetX = 0;
    imageOffsetY = 0;
    updateImageTransform();
    imageViewer.classList.remove("hidden");
    document.body.style.overflow = "hidden";
  }

  function hideImageViewer() {
    imageViewer.classList.add("hidden");
    imageViewerImg.src = "";
    document.body.style.overflow = "";
    imageScale = 1;
    imageOffsetX = 0;
    imageOffsetY = 0;
  }

  function updateImageTransform() {
    imageViewerImg.style.transform = `translate(${imageOffsetX}px, ${imageOffsetY}px) scale(${imageScale})`;
  }

  function handleImageWheel(e) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    imageScale = Math.max(0.2, Math.min(5, imageScale * delta));
    updateImageTransform();
  }

  function handleImageMouseDown(e) {
    if (e.button !== 0) return;
    isDragging = true;
    dragStartX = e.clientX - imageOffsetX;
    dragStartY = e.clientY - imageOffsetY;
    imageViewer.querySelector(".image-viewer-content").style.cursor =
      "grabbing";
  }

  function handleImageMouseMove(e) {
    if (!isDragging) return;
    e.preventDefault();
    imageOffsetX = e.clientX - dragStartX;
    imageOffsetY = e.clientY - dragStartY;
    updateImageTransform();
  }

  function handleImageMouseUp() {
    isDragging = false;
    imageViewer.querySelector(".image-viewer-content").style.cursor = "grab";
  }

  // Handle image upload for a map
  async function handleImageUpload(map, actIdx, mapIdx) {
    if (!window.electronAPI?.selectImageFile) {
      showToast("Electron API 不可用");
      return;
    }

    const result = await window.electronAPI.selectImageFile();
    if (!result.success) {
      if (result.error !== "用户取消") {
        showToast(result.error || "选择图片失败");
      }
      return;
    }

    if (!map.images) map.images = [];
    map.images.push(result.filePath);
    saveData();
    renderAll();
  }

  // Handle image delete for a map
  function handleImageDelete(map, imgIdx) {
    if (confirm("确定要删除这张图片吗？")) {
      if (map.images && map.images.length > imgIdx) {
        map.images.splice(imgIdx, 1);
        saveData();
        renderAll();
      }
    }
  }

  // Handle image upload for a chapter (act)
  async function handleActImageUpload(act, actIdx) {
    if (!window.electronAPI?.selectImageFile) {
      showToast("Electron API 不可用");
      return;
    }

    const result = await window.electronAPI.selectImageFile();
    if (!result.success) {
      if (result.error !== "用户取消") {
        showToast(result.error || "选择图片失败");
      }
      return;
    }

    if (!act.images) act.images = [];
    act.images.push(result.filePath);
    saveData();
    renderAll();
  }

  // Handle image delete for a chapter (act)
  function handleActImageDelete(act, imgIdx) {
    if (confirm("确定要删除这张图片吗？")) {
      if (act.images && act.images.length > imgIdx) {
        act.images.splice(imgIdx, 1);
        saveData();
        renderAll();
      }
    }
  }

  // Drag handlers
  function handleDragOver(e) {
    e.preventDefault();
    e.currentTarget.classList.add("drag-over");
  }

  function handleDragLeave(e) {
    e.currentTarget.classList.remove("drag-over");
  }

  // Click handlers
  function handleActHeaderClick(actIdx, e) {
    if (e.target.tagName === "BUTTON" || e.target.tagName === "INPUT") return;
    if (collapsedActs.has(actIdx)) {
      collapsedActs.delete(actIdx);
      const allTasks = questData[actIdx].maps.flatMap((m) => m.tasks);
      if (allTasks.length > 0 && allTasks.every((t) => checkedState[t.id])) {
        manuallyExpandedActs.add(actIdx);
      }
    } else {
      collapsedActs.add(actIdx);
      manuallyExpandedActs.delete(actIdx);
    }
    renderAll();
  }

  function handleMapHeaderClick(mapKey, actIdx, mapIdx, e) {
    if (e.target.tagName === "BUTTON" || e.target.tagName === "INPUT") return;
    if (collapsedMaps.has(mapKey)) {
      collapsedMaps.delete(mapKey);
      const map = questData[actIdx].maps[mapIdx];
      if (map.tasks.length > 0 && map.tasks.every((t) => checkedState[t.id])) {
        manuallyExpandedMaps.add(mapKey);
      }
    } else {
      collapsedMaps.add(mapKey);
      manuallyExpandedMaps.delete(mapKey);
    }
    renderAll();
  }

  // Render functions
  function renderAll() {
    console.log("[renderAll] 开始渲染，questData 长度:", questData?.length);
    applySmartAutoCollapse();
    const container = document.getElementById("actContainer");
    const fragment = document.createDocumentFragment();

    questData.forEach((act, actIdx) => {
      const actSection = renderAct(act, actIdx);
      fragment.appendChild(actSection);
    });
    console.log("[renderAll] 渲染完成，章节数:", questData?.length);

    // 总是显示添加章节按钮
    fragment.appendChild(renderAddActButton());

    container.innerHTML = "";
    container.appendChild(fragment);
    updateGlobalProgress();
  }

  // 渲染单个章节
  function renderAct(act, actIdx) {
    const allActTasks = act.maps.flatMap((m) => m.tasks);
    const actProgress = calcProgress(allActTasks);
    const actDiv = document.createElement("div");
    actDiv.className = "act-section";

    // Act header
    const actHeader = document.createElement("div");
    actHeader.className = "act-header";
    const collapseIcon = document.createElement("span");
    collapseIcon.className = "collapse-icon";
    collapseIcon.textContent = collapsedActs.has(actIdx) ? "▲" : "▼";
    actHeader.appendChild(collapseIcon);
    const actTitleSpan = document.createElement("span");
    actTitleSpan.className = "act-title";
    actTitleSpan.innerHTML = `📖 ${escapeHtml(act.act)}`;
    const actBtn1 = document.createElement("button");
    actBtn1.className = "icon-btn btn-1";
    actBtn1.textContent = localEditActs.has(actIdx) ? "关闭编辑" : "开始编辑";
    actBtn1.title = localEditActs.has(actIdx) ? "关闭编辑" : "开始编辑";
    actBtn1.addEventListener("click", (e) => {
      e.stopPropagation();
      if (localEditActs.has(actIdx)) {
        // 关闭局部编辑
        localEditActs.delete(actIdx);
        act.maps.forEach((map, mapIdx) => {
          const mapKey = `${actIdx}_${mapIdx}`;
          localEditMaps.delete(mapKey);
        });
        actBtn1.textContent = "开始编辑";
        actBtn1.title = "开始编辑";
        console.log("章节关闭编辑:", act.act);
      } else {
        // 启用局部编辑
        localEditActs.add(actIdx);
        act.maps.forEach((map, mapIdx) => {
          const mapKey = `${actIdx}_${mapIdx}`;
          localEditMaps.add(mapKey);
        });
        actBtn1.textContent = "关闭编辑";
        actBtn1.title = "关闭编辑";
        // 展开章节
        if (collapsedActs.has(actIdx)) {
          collapsedActs.delete(actIdx);
        }
        manuallyExpandedActs.add(actIdx);
        // 展开章节内所有地图
        act.maps.forEach((map, mapIdx) => {
          const mapKey = `${actIdx}_${mapIdx}`;
          if (collapsedMaps.has(mapKey)) {
            collapsedMaps.delete(mapKey);
          }
          manuallyExpandedMaps.add(mapKey);
        });
        console.log("章节局部编辑:", act.act);
      }
      renderAll();
    });
    actTitleSpan.appendChild(actBtn1);
    // Chapter Images - 添加到开始编辑后，进度条前
    const actImagesContainer = document.createElement("div");
    actImagesContainer.className = "act-images-container";

    // 总是显示 mapUrl 中的地图图片
    if (act.mapUrl && act.mapUrl.length > 0) {
      act.mapUrl.forEach((imgSrc, imgIdx) => {
        const imgWrapper = document.createElement("div");
        imgWrapper.className = "act-image-wrapper";
        const actImg = document.createElement("img");
        actImg.className = "act-image-thumb";
        const imgUrl = `image/POE2map/actMap/${imgSrc}`;
        actImg.src = imgUrl;
        actImg.alt = `${act.act} - 地图${imgIdx + 1}`;
        actImg.addEventListener("click", (e) => {
          e.stopPropagation();
          showImageViewer(imgUrl, `${act.act} - 地图${imgIdx + 1}`);
        });
        imgWrapper.appendChild(actImg);
        if (editMode || localEditActs.has(actIdx)) {
          const delImgBtn = document.createElement("button");
          delImgBtn.className = "image-delete-btn";
          delImgBtn.textContent = "&#x1F5D1;";
          delImgBtn.title = "删除图片";
          delImgBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (confirm("确定要删除这张地图图片吗？")) {
              act.mapUrl.splice(imgIdx, 1);
              saveData();
              renderAll();
            }
          });
          imgWrapper.appendChild(delImgBtn);
        }
        actImagesContainer.appendChild(imgWrapper);
      });
    }

    // 然后显示原有的 images
    if (act.images && act.images.length > 0) {
      act.images.forEach((imgSrc, imgIdx) => {
        const imgWrapper = document.createElement("div");
        imgWrapper.className = "act-image-wrapper";
        const actImg = document.createElement("img");
        actImg.className = "act-image-thumb";
        const imgUrl = getImageUrl(imgSrc);
        actImg.src = imgUrl;
        actImg.alt = `${act.act} - ${imgIdx + 1}`;
        actImg.addEventListener("click", (e) => {
          e.stopPropagation();
          showImageViewer(imgUrl, `${act.act} - ${imgIdx + 1}`);
        });
        imgWrapper.appendChild(actImg);
        if (editMode || localEditActs.has(actIdx)) {
          const delImgBtn = document.createElement("button");
          delImgBtn.className = "image-delete-btn";
          delImgBtn.textContent = "&#x1F5D1;";
          delImgBtn.title = "删除图片";
          delImgBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            handleActImageDelete(act, imgIdx);
          });
          imgWrapper.appendChild(delImgBtn);
        }
        actImagesContainer.appendChild(imgWrapper);
      });
    }
    if (editMode || localEditActs.has(actIdx)) {
      const imgPlaceholder = document.createElement("div");
      imgPlaceholder.className = "act-image-placeholder";
      imgPlaceholder.textContent = "&#x1F4F7; 添加图片";
      imgPlaceholder.addEventListener("click", (e) => {
        e.stopPropagation();
        handleActImageUpload(act, actIdx);
      });
      actImagesContainer.appendChild(imgPlaceholder);
    }
    if (actImagesContainer.children.length > 0) {
      actTitleSpan.appendChild(actImagesContainer);
    }

    const actProgressDiv = document.createElement("div");
    actProgressDiv.className = "act-progress";
    actProgressDiv.innerHTML = `<span>进度</span><progress value="${actProgress}" max="100"></progress><span>${actProgress}%</span>`;
    actTitleSpan.appendChild(actProgressDiv);
    actHeader.appendChild(actTitleSpan);

    if (editMode || localEditActs.has(actIdx)) {
      const editActBtn = document.createElement("button");
      editActBtn.className = "icon-btn";
      editActBtn.textContent = "✎";
      editActBtn.title = "编辑章节名";
      editActBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        showModal(
          "编辑章节",
          [{ label: "章节名", id: "actName", value: act.act }],
          (vals) => {
            act.act = vals.actName;
            saveData();
            renderAll();
          },
        );
      });
      actHeader.appendChild(editActBtn);

      const delActBtn = document.createElement("button");
      delActBtn.className = "icon-btn";
      delActBtn.textContent = "✕";
      delActBtn.title = "删除章节";
      delActBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (confirm(`确定要删除章节"${act.act}"及其所有内容吗？`)) {
          act.maps.forEach((m) =>
            m.tasks.forEach((t) => delete checkedState[t.id]),
          );
          questData.splice(actIdx, 1);
          saveData();
          saveChecks();
          renderAll();
        }
      });
      actHeader.appendChild(delActBtn);
    }

    actHeader.addEventListener("click", (e) => handleActHeaderClick(actIdx, e));
    actDiv.appendChild(actHeader);

    // Act content
    const actContent = document.createElement("div");
    actContent.className = "act-content";
    if (collapsedActs.has(actIdx)) actContent.classList.add("hidden");

    const bossDiv = document.createElement("div");
    bossDiv.className = "boss-strategy";
    bossDiv.innerHTML = `📋 章节攻略: ${escapeHtml(act.bossStrategy || "暂无")}`;
    if (editMode || localEditActs.has(actIdx)) {
      const editBossBtn = document.createElement("button");
      editBossBtn.className = "icon-btn";
      editBossBtn.textContent = "✎";
      editBossBtn.title = "编辑章节攻略";
      editBossBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        showModal(
          "编辑章节攻略",
          [
            {
              label: "攻略",
              id: "boss",
              type: "textarea",
              value: act.bossStrategy || "",
            },
          ],
          (vals) => {
            act.bossStrategy = vals.boss;
            saveData();
            renderAll();
          },
        );
      });
      bossDiv.appendChild(editBossBtn);
    }
    actContent.appendChild(bossDiv);

    // Chapter Boss 攻略
    const chapterBossDiv = document.createElement("div");
    chapterBossDiv.className = "chapter-boss-strategy";
    chapterBossDiv.innerHTML = `👑 章节Boss: ${escapeHtml(act.chapterBoss || "暂无")}`;
    if (editMode || localEditActs.has(actIdx)) {
      const editChapterBossBtn = document.createElement("button");
      editChapterBossBtn.className = "icon-btn";
      editChapterBossBtn.textContent = "✎";
      editChapterBossBtn.title = "编辑章节Boss攻略";
      editChapterBossBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        showModal(
          "编辑章节Boss攻略",
          [
            {
              label: "Boss攻略",
              id: "chapterBoss",
              type: "textarea",
              value: act.chapterBoss || "",
            },
          ],
          (vals) => {
            act.chapterBoss = vals.chapterBoss;
            saveData();
            renderAll();
          },
        );
      });
      chapterBossDiv.appendChild(editChapterBossBtn);
    }
    actContent.appendChild(chapterBossDiv);

    // 查看已完成地图按钮
    const toggleCompletedBtn = document.createElement("button");
    toggleCompletedBtn.className = "toggle-completed-btn";
    const completedMapsCount = act.maps.filter(
      (map) =>
        map.tasks.length > 0 && map.tasks.every((t) => checkedState[t.id]),
    ).length;
    if (completedMapsCount === 0 && showCompletedMaps.has(actIdx)) {
      showCompletedMaps.delete(actIdx);
    }
    const isShowingCompleted = showCompletedMaps.has(actIdx);
    toggleCompletedBtn.textContent = isShowingCompleted
      ? "🔽 隐藏已完成地图"
      : "🔍 查看已完成地图";
    toggleCompletedBtn.style.display =
      completedMapsCount > 0 ? "block" : "none";
    toggleCompletedBtn.addEventListener("click", () => {
      if (showCompletedMaps.has(actIdx)) {
        showCompletedMaps.delete(actIdx);
      } else {
        showCompletedMaps.add(actIdx);
      }
      renderAll();
    });
    actContent.appendChild(toggleCompletedBtn);

    // Maps
    act.maps.forEach((map, mapIdx) => {
      const isMapCompleted =
        map.tasks.length > 0 && map.tasks.every((t) => checkedState[t.id]);
      if (isMapCompleted && !showCompletedMaps.has(actIdx)) {
        return;
      }
      const mapKey = `${actIdx}_${mapIdx}`;
      const mapProgress = calcProgress(map.tasks);
      const mapGroup = document.createElement("div");
      mapGroup.className = "map-group";

      if (editMode || localEditMaps.has(mapKey)) {
        mapGroup.draggable = true;
        mapGroup.addEventListener("dragstart", (e) => {
          draggedMapIndex = mapIdx;
          e.dataTransfer.setData("text/plain", "");
          e.dataTransfer.effectAllowed = "move";
        });
        mapGroup.addEventListener("dragover", handleDragOver);
        mapGroup.addEventListener("dragleave", handleDragLeave);
        mapGroup.addEventListener("drop", (e) => {
          e.preventDefault();
          e.currentTarget.classList.remove("drag-over");
          if (draggedMapIndex !== null && draggedMapIndex !== mapIdx) {
            const moved = act.maps.splice(draggedMapIndex, 1)[0];
            act.maps.splice(mapIdx, 0, moved);
            saveData();
            renderAll();
          }
          draggedMapIndex = null;
        });
      }

      const mapHeader = document.createElement("div");
      mapHeader.className = "map-header";

      const mapNameSpan = document.createElement("span");
      mapNameSpan.innerHTML = `🗺️ ${escapeHtml(map.mapName)}`;
      mapHeader.appendChild(mapNameSpan);

      const mapCollapseIcon = document.createElement("span");
      mapCollapseIcon.className = "collapse-icon";
      mapCollapseIcon.textContent = collapsedMaps.has(mapKey) ? "▲" : "▼";
      mapHeader.appendChild(mapCollapseIcon);

      if (map.level && map.level > 0) {
        const levelBadge = document.createElement("span");
        levelBadge.className = "level-badge";
        levelBadge.textContent = `Lv.${map.level}`;
        mapHeader.appendChild(levelBadge);
      }

      const mapProgressSpan = document.createElement("span");
      mapProgressSpan.className = "map-progress";
      mapProgressSpan.innerHTML = `<progress value="${mapProgress}" max="100"></progress> ${mapProgress}%`;
      mapHeader.appendChild(mapProgressSpan);

      const mapBtn1 = document.createElement("button");
      mapBtn1.className = "icon-btn btn-1";
      mapBtn1.textContent = localEditMaps.has(mapKey) ? "关闭编辑" : "开始编辑";
      mapBtn1.title = localEditMaps.has(mapKey) ? "关闭编辑" : "开始编辑";
      mapBtn1.addEventListener("click", (e) => {
        e.stopPropagation();
        if (localEditMaps.has(mapKey)) {
          // 关闭地图编辑
          localEditMaps.delete(mapKey);
          mapBtn1.textContent = "开始编辑";
          mapBtn1.title = "开始编辑";
          console.log("地图关闭编辑:", map.mapName);
        } else {
          // 只启用地图编辑，不开启章节编辑
          localEditMaps.add(mapKey);
          mapBtn1.textContent = "关闭编辑";
          mapBtn1.title = "关闭编辑";
          // 展开章节（以便看到地图）
          if (collapsedActs.has(actIdx)) {
            collapsedActs.delete(actIdx);
          }
          manuallyExpandedActs.add(actIdx);
          // 展开对应地图
          if (collapsedMaps.has(mapKey)) {
            collapsedMaps.delete(mapKey);
          }
          manuallyExpandedMaps.add(mapKey);
          console.log("地图局部编辑:", map.mapName);
        }
        renderAll();
      });
      // Map Images
      const imagesContainer = document.createElement("div");
      imagesContainer.className = "map-images-container";
      if (map.images && map.images.length > 0) {
        map.images.forEach((imgSrc, imgIdx) => {
          const imgWrapper = document.createElement("div");
          imgWrapper.className = "map-image-wrapper";
          const mapImg = document.createElement("img");
          mapImg.className = "map-image-thumb";
          const imgUrl = getImageUrl(imgSrc);
          mapImg.src = imgUrl;
          mapImg.alt = `${map.mapName} - ${imgIdx + 1}`;
          mapImg.addEventListener("click", (e) => {
            e.stopPropagation();
            showImageViewer(imgUrl, `${map.mapName} - ${imgIdx + 1}`);
          });
          imgWrapper.appendChild(mapImg);
          if (editMode || localEditMaps.has(mapKey)) {
            const delImgBtn = document.createElement("button");
            delImgBtn.className = "image-delete-btn";
            delImgBtn.textContent = "&#x1F5D1;";
            delImgBtn.title = "删除图片";
            delImgBtn.addEventListener("click", (e) => {
              e.stopPropagation();
              handleImageDelete(map, imgIdx);
            });
            imgWrapper.appendChild(delImgBtn);
          }
          imagesContainer.appendChild(imgWrapper);
        });
      }
      if (editMode || localEditMaps.has(mapKey)) {
        const imgPlaceholder = document.createElement("div");
        imgPlaceholder.className = "map-image-placeholder";
        imgPlaceholder.textContent = "&#x1F4F7; 添加图片";
        imgPlaceholder.addEventListener("click", (e) => {
          e.stopPropagation();
          handleImageUpload(map, actIdx, mapIdx);
        });
        imagesContainer.appendChild(imgPlaceholder);
      }
      if (imagesContainer.children.length > 0) {
        mapHeader.appendChild(imagesContainer);
      }

      mapHeader.addEventListener("click", (e) =>
        handleMapHeaderClick(mapKey, actIdx, mapIdx, e),
      );

      if (editMode || localEditMaps.has(mapKey)) {
        const editMapBtn = document.createElement("button");
        editMapBtn.className = "icon-btn";
        editMapBtn.textContent = "✎";
        editMapBtn.title = "编辑地图名";
        editMapBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          showModal(
            "编辑地图",
            [
              { label: "地图名", id: "mapName", value: map.mapName },
              { label: "推荐等级", id: "level", value: map.level || "" },
            ],
            (vals) => {
              map.mapName = vals.mapName;
              map.level = vals.level;
              saveData();
              renderAll();
            },
          );
        });
        mapHeader.appendChild(editMapBtn);

        const delMapBtn = document.createElement("button");
        delMapBtn.className = "icon-btn";
        delMapBtn.textContent = "✕";
        delMapBtn.title = "删除地图";
        delMapBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          if (confirm(`确定要删除地图"${map.mapName}"吗？`)) {
            map.tasks.forEach((t) => delete checkedState[t.id]);
            act.maps.splice(mapIdx, 1);
            saveData();
            saveChecks();
            renderAll();
          }
        });
        mapHeader.appendChild(delMapBtn);
      }
      // 创建水平容器包裹地图栏和开始编辑按钮
      const headerContainer = document.createElement("div");
      headerContainer.className = "map-header-container";
      headerContainer.appendChild(mapHeader);
      headerContainer.appendChild(mapBtn1);
      mapGroup.appendChild(headerContainer);

      if (!collapsedMaps.has(mapKey)) {
        const stratDiv = document.createElement("div");
        stratDiv.className = "map-strategy";
        stratDiv.innerHTML = `📝 地图攻略: ${escapeHtml(map.mapStrategy || "暂无")}`;
        if (editMode || localEditMaps.has(mapKey)) {
          const editStratBtn = document.createElement("button");
          editStratBtn.className = "icon-btn";
          editStratBtn.textContent = "✎";
          editStratBtn.title = "编辑攻略";
          editStratBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            showModal(
              "编辑攻略",
              [
                {
                  label: "攻略",
                  id: "strat",
                  type: "textarea",
                  value: map.mapStrategy || "",
                },
              ],
              (vals) => {
                map.mapStrategy = vals.strat;
                saveData();
                renderAll();
              },
            );
          });
          stratDiv.appendChild(editStratBtn);
        }
        mapGroup.appendChild(stratDiv);

        const taskList = document.createElement("ul");
        taskList.className = "task-list";
        const activeTasks = [];
        const completedTasks = [];
        map.tasks.forEach((t, idx) =>
          checkedState[t.id]
            ? completedTasks.push({ t, idx })
            : activeTasks.push({ t, idx }),
        );

        const renderTask = (task, tIdx) => {
          const li = document.createElement("li");
          li.className = "task-item";
          if (editMode || localEditMaps.has(mapKey)) {
            li.draggable = true;
            li.addEventListener("dragstart", (e) => {
              draggedTaskIndex = tIdx;
              dragSourceMapIdx = mapIdx;
              e.dataTransfer.setData("text/plain", "");
              e.dataTransfer.effectAllowed = "move";
            });
            li.addEventListener("dragover", handleDragOver);
            li.addEventListener("dragleave", handleDragLeave);
            li.addEventListener("drop", (e) => {
              e.preventDefault();
              e.currentTarget.classList.remove("drag-over");
              if (
                draggedTaskIndex !== null &&
                dragSourceMapIdx === mapIdx &&
                draggedTaskIndex !== tIdx
              ) {
                const moved = map.tasks.splice(draggedTaskIndex, 1)[0];
                map.tasks.splice(tIdx, 0, moved);
                saveData();
                renderAll();
              }
              draggedTaskIndex = null;
              dragSourceMapIdx = null;
            });
          }

          const cb = document.createElement("input");
          cb.type = "checkbox";
          cb.className = "task-checkbox";
          cb.checked = !!checkedState[task.id];
          cb.setAttribute("aria-label", task.description);
          cb.addEventListener("change", () => {
            cb.checked
              ? (checkedState[task.id] = true)
              : delete checkedState[task.id];
            saveChecks();
            renderAll();
            window.electronAPI?.syncTaskCheckToFloat?.(task.id, cb.checked);

            if (cb.checked && isFloatWindowOpen) {
              const mapIndex = findMapIndexByTaskId(task.id);
              if (mapIndex !== -1 && mapIndex !== floatMapIndex) {
                floatMapIndex = mapIndex;
                updateFloatWindow();
              }

              if (mapIndex !== -1) {
                const currentMapData = floatAllMaps[mapIndex];
                const allTasksCompleted = currentMapData.map.tasks.every(
                  (t) => checkedState[t.id],
                );
                if (allTasksCompleted && mapIndex === floatMapIndex) {
                  const nextIndex = (mapIndex + 1) % floatAllMaps.length;
                  floatMapIndex = nextIndex;
                  updateFloatWindow();
                  try {
                    localStorage.setItem(
                      "poe2_float_map_index",
                      floatMapIndex.toString(),
                    );
                  } catch (e) {}
                }
              }
            }
          });

          const labelSpan = document.createElement("span");
          labelSpan.className = "task-label";
          if (cb.checked) labelSpan.classList.add("completed-text");
          labelSpan.appendChild(document.createTextNode(task.description));

          // 过滤空标签
          filterNonEmpty(task.tags).forEach((tag) => {
            const badge = document.createElement("span");
            badge.className = "badge";
            if (tag === "必做") badge.classList.add("must");
            else if (tag === "可选") badge.classList.add("optional");
            else if (tag === "主线" || tag === "★★★")
              badge.classList.add("main-quest");
            else if (tag === "精英") badge.classList.add("elite");
            else if (tag === "事件") badge.classList.add("event");
            badge.textContent = tag;
            labelSpan.appendChild(badge);
          });

          const rewardDiv = document.createElement("span");
          rewardDiv.className = "reward-area";
          filterNonEmpty(task.rewardTags).forEach((r) => {
            const rb = document.createElement("span");
            rb.className = "badge reward-badge";
            rb.textContent = `🏆 ${r}`;
            rewardDiv.appendChild(rb);
          });

          li.appendChild(cb);
          li.appendChild(labelSpan);
          li.appendChild(rewardDiv);

          if (editMode || localEditMaps.has(mapKey)) {
            const editBtn = document.createElement("button");
            editBtn.className = "icon-btn";
            editBtn.textContent = "✎";
            editBtn.title = "编辑任务";
            editBtn.addEventListener("click", (e) => {
              e.stopPropagation();
              showModal(
                "编辑任务",
                [
                  { label: "描述", id: "desc", value: task.description },
                  {
                    label: "优先级标签",
                    id: "prioritySelect",
                    type: "select",
                    value:
                      (task.tags || []).find((tag) =>
                        ["主线", "必做", "可选", "事件"].includes(tag),
                      ) || "",
                    options: [
                      { value: "", text: "请选择优先级" },
                      { value: "主线", text: "主线" },
                      { value: "必做", text: "必做" },
                      { value: "精英", text: "精英" },
                      { value: "可选", text: "可选" },
                      { value: "事件", text: "事件" },
                    ],
                  },
                  {
                    label: "奖励标签(中文逗号)",
                    id: "rewardTags",
                    value: (task.rewardTags || []).join("，"),
                  },
                ],
                (vals) => {
                  task.description = vals.desc;

                  // 处理标签
                  const newTags = [];
                  if (vals.prioritySelect) {
                    newTags.push(vals.prioritySelect);
                  }
                  task.tags = newTags;

                  task.rewardTags = vals.rewardTags
                    .split(/[,，]/)
                    .map((s) => s.trim())
                    .filter((s) => s);
                  saveData();
                  renderAll();
                },
              );
            });
            li.appendChild(editBtn);

            const delBtn = document.createElement("button");
            delBtn.className = "icon-btn";
            delBtn.textContent = "✕";
            delBtn.title = "删除任务";
            delBtn.addEventListener("click", (e) => {
              e.stopPropagation();
              if (confirm("确定要删除此任务吗？")) {
                delete checkedState[task.id];
                map.tasks.splice(tIdx, 1);
                saveData();
                saveChecks();
                renderAll();
              }
            });
            li.appendChild(delBtn);
          }
          return li;
        };

        activeTasks.forEach(({ t, idx }) =>
          taskList.appendChild(renderTask(t, idx)),
        );
        if (completedTasks.length) {
          const toggleKey = `completed_${actIdx}_${mapIdx}`;
          const show = showCompletedTasks.has(toggleKey);
          const toggleBtn = document.createElement("button");
          toggleBtn.className = "toggle-completed-btn";
          toggleBtn.textContent = show
            ? `🔽 隐藏已完成 (${completedTasks.length})`
            : `🔼 显示已完成 (${completedTasks.length})`;
          toggleBtn.addEventListener("click", () => {
            showCompletedTasks.has(toggleKey)
              ? showCompletedTasks.delete(toggleKey)
              : showCompletedTasks.add(toggleKey);
            renderAll();
          });
          taskList.appendChild(toggleBtn);
          if (show)
            completedTasks.forEach(({ t, idx }) =>
              taskList.appendChild(renderTask(t, idx)),
            );
        }
        mapGroup.appendChild(taskList);

        if (editMode || localEditMaps.has(mapKey)) {
          const addTaskBtn = document.createElement("button");
          addTaskBtn.className = "add-btn";
          addTaskBtn.textContent = "+ 添加任务";
          addTaskBtn.addEventListener("click", () =>
            showModal(
              "添加任务",
              [
                { label: "描述", id: "desc", value: "" },
                {
                  label: "优先级标签",
                  id: "prioritySelect",
                  type: "select",
                  value: "必做",
                  options: [
                    { value: "", text: "请选择优先级" },
                    { value: "主线", text: "主线" },
                    { value: "必做", text: "必做" },
                    { value: "精英", text: "精英" },
                    { value: "可选", text: "可选" },
                    { value: "事件", text: "事件" },
                  ],
                },
                { label: "奖励标签(中文逗号)", id: "rewardTags", value: "" },
              ],
              (vals) => {
                // 处理标签
                const newTags = [];
                if (vals.prioritySelect) {
                  newTags.push(vals.prioritySelect);
                }

                map.tasks.push({
                  id: generateId(),
                  description: vals.desc || "新任务",
                  tags: newTags,
                  rewardTags: vals.rewardTags
                    .split(/[,，]/)
                    .map((s) => s.trim())
                    .filter((s) => s),
                });
                saveData();
                renderAll();
              },
            ),
          );
          mapGroup.appendChild(addTaskBtn);
        }
      }
      actContent.appendChild(mapGroup);
    });

    if (editMode || localEditActs.has(actIdx)) {
      const addMapBtn = document.createElement("button");
      addMapBtn.className = "add-btn";
      addMapBtn.textContent = "+ 添加地图";
      addMapBtn.addEventListener("click", () =>
        showModal(
          "添加地图",
          [{ label: "地图名", id: "mapName", value: "" }],
          (vals) => {
            act.maps.push({
              mapName: vals.mapName || "新地图",
              mapStrategy: "",
              tasks: [],
            });
            saveData();
            renderAll();
          },
        ),
      );
      actContent.appendChild(addMapBtn);
    }
    actDiv.appendChild(actContent);
    return actDiv;
  }

  function renderAddActButton() {
    const addActBtn = document.createElement("button");
    addActBtn.className = "add-btn";
    addActBtn.style.marginTop = "8px";
    addActBtn.textContent = "+ 添加章节";
    addActBtn.addEventListener("click", () =>
      showModal(
        "添加章节",
        [{ label: "章节名", id: "actName", value: "" }],
        (vals) => {
          questData.push({
            act: vals.actName || "新章节",
            bossStrategy: "",
            maps: [],
          });
          saveData();
          renderAll();
        },
      ),
    );
    return addActBtn;
  }

  // Event listeners
  document.getElementById("modalSave").addEventListener("click", () => {
    if (!modalCallback) return;
    const vals = {};
    modalFields
      .querySelectorAll("input, select, textarea")
      .forEach((el) => (vals[el.id] = el.value));
    modalCallback(vals);
    hideModal();
  });

  document.getElementById("modalCancel").addEventListener("click", hideModal);
  window.addEventListener("click", (e) => {
    if (e.target === modal) hideModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.classList.contains("hidden")) hideModal();
  });

  // 奖励任务检查功能
  const rewardsModal = document.getElementById("rewardsModal");
  const rewardsList = document.getElementById("rewardsList");
  const rewardsCount = document.getElementById("rewardsCount");

  document.getElementById("checkRewardsBtn").addEventListener("click", () => {
    showRewardsModal();
  });

  document.getElementById("rewardsClose").addEventListener("click", () => {
    rewardsModal.classList.add("hidden");
  });

  window.addEventListener("click", (e) => {
    if (e.target === rewardsModal) {
      rewardsModal.classList.add("hidden");
    }
  });

  function showRewardsModal() {
    const rewardTasks = [];

    // 收集所有未完成的奖励任务
    questData.forEach((chapter, chapterIdx) => {
      chapter.maps.forEach((map, mapIdx) => {
        map.tasks.forEach((task, taskIdx) => {
          // 检查是否有奖励标签且未完成
          if (
            !checkedState[task.id] &&
            task.rewardTags &&
            task.rewardTags.length > 0
          ) {
            rewardTasks.push({
              id: task.id,
              description: task.description,
              location: `${chapter.act} - ${map.mapName}`,
              chapterIdx: chapterIdx,
              mapIdx: mapIdx,
              rewards: task.rewardTags,
            });
          }
        });
      });
    });

    // 显示统计信息
    rewardsCount.textContent = rewardTasks.length;

    // 清空并重新填充列表
    rewardsList.innerHTML = "";

    if (rewardTasks.length === 0) {
      rewardsList.innerHTML =
        '<div style="text-align: center; color: var(--text-secondary); padding: 20px;">🎉 所有奖励任务都已完成！</div>';
    } else {
      rewardTasks.forEach((task) => {
        const taskElement = document.createElement("div");
        taskElement.className = "reward-item";
        taskElement.addEventListener("click", () => {
          // 跳转到对应地图
          scrollToMap(task.location.split(" - ")[1]);
          rewardsModal.classList.add("hidden");
        });

        const infoDiv = document.createElement("div");
        infoDiv.className = "reward-item-info";

        const descDiv = document.createElement("div");
        descDiv.className = "reward-item-description";
        descDiv.textContent = task.description;

        const locDiv = document.createElement("div");
        locDiv.className = "reward-item-location";
        locDiv.textContent = `📍 ${task.location}`;

        infoDiv.appendChild(descDiv);
        infoDiv.appendChild(locDiv);

        const tagsDiv = document.createElement("div");
        tagsDiv.className = "reward-item-tags";
        task.rewards.forEach((reward) => {
          const tagSpan = document.createElement("span");
          tagSpan.className = "reward-tag";
          tagSpan.textContent = reward;
          tagsDiv.appendChild(tagSpan);
        });

        taskElement.appendChild(infoDiv);
        taskElement.appendChild(tagsDiv);
        rewardsList.appendChild(taskElement);
      });
    }

    rewardsModal.classList.remove("hidden");
  }

  // Image Viewer Event Listeners
  document
    .getElementById("imageViewerClose")
    .addEventListener("click", hideImageViewer);
  imageViewer.addEventListener("click", (e) => {
    if (
      e.target === imageViewer ||
      e.target.classList.contains("image-viewer-content")
    ) {
      hideImageViewer();
    }
  });
  imageViewerImg.addEventListener("wheel", handleImageWheel);
  imageViewerImg.addEventListener("mousedown", handleImageMouseDown);
  imageViewer
    .querySelector(".image-viewer-content")
    .addEventListener("mousemove", handleImageMouseMove);
  imageViewer
    .querySelector(".image-viewer-content")
    .addEventListener("mouseup", handleImageMouseUp);
  imageViewer
    .querySelector(".image-viewer-content")
    .addEventListener("mouseleave", handleImageMouseUp);

  // Edit mode toggle (checkbox已删除)
  const resetDataBtn = document.getElementById("resetDataBtn");

  resetDataBtn.addEventListener("click", async () => {
    if (
      confirm(
        "确定要重置所有地图数据吗？这将恢复默认地图列表，自定义修改会丢失！",
      )
    ) {
      try {
        localStorage.removeItem(STORAGE_DATA_KEY);
        const response = await fetch("data.json");
        const rawData = await response.json();
        // 新的数据结构：{ poe2BD: [], act: [...] }
        questData = transformData(rawData.act || rawData);
        checkedState = {};
        localStorage.removeItem(STORAGE_CHECK_KEY);
        collapsedActs.clear();
        collapsedMaps.clear();
        manuallyExpandedActs.clear();
        manuallyExpandedMaps.clear();
        showCompletedTasks.clear();
        showCompletedMaps.clear();
        renderAll();
        alert("地图数据已重置为默认值！");
      } catch (e) {
        alert("重置失败：" + e.message);
      }
    }
  });

  // Theme toggle
  document.getElementById("themeCheckbox").addEventListener("change", (e) => {
    const isLight = e.target.checked;
    document.body.classList.toggle("light-theme", isLight);
    try {
      localStorage.setItem(STORAGE_THEME_KEY, isLight ? "light" : "dark");
    } catch (e) {}
  });

  // Reset button
  document.getElementById("resetAllBtn").addEventListener("click", () => {
    if (confirm("确定要清除所有任务的勾选状态吗？此操作不可恢复。")) {
      checkedState = {};
      manuallyExpandedActs.clear();
      manuallyExpandedMaps.clear();
      collapsedActs.clear();
      collapsedMaps.clear();
      saveChecks();
      renderAll();
      window.electronAPI?.syncTaskCheckToFloat?.("reset_all", false);

      floatMapIndex = 0;
      updateFloatWindow();
      try {
        localStorage.setItem("poe2_float_map_index", "0");
      } catch (e) {}
    }
  });

  // Initialize
  async function init() {
    await loadData();
    applyInitialAutoCollapse();
    renderAll();

    try {
      const savedMapIndex = localStorage.getItem("poe2_float_map_index");
      if (savedMapIndex) {
        const index = parseInt(savedMapIndex, 10);
        if (!isNaN(index) && index >= 0) {
          floatMapIndex = index;
        }
      }
    } catch (e) {}

    initFloatMode();
  }
  init();

  // ================== 浮窗模式 ==================
  let floatMapIndex = 0;
  let floatAllMaps = [];
  let isFloatWindowOpen = false;

  function flattenMapsForFloat() {
    floatAllMaps = [];
    questData.forEach((chapter, chapterIdx) => {
      chapter.maps.forEach((map, mapIdx) => {
        if (map.tasks && map.tasks.length > 0) {
          floatAllMaps.push({
            chapter: chapter.act,
            chapterIdx: chapterIdx,
            map: map,
            mapIdx: mapIdx,
            id: `c${chapterIdx + 1}m${mapIdx + 1}`,
          });
        }
      });
    });
  }

  function getCurrentFloatData() {
    if (floatAllMaps.length === 0) flattenMapsForFloat();
    if (floatMapIndex >= floatAllMaps.length) floatMapIndex = 0;
    if (floatMapIndex < 0) floatMapIndex = floatAllMaps.length - 1;

    const data = floatAllMaps[floatMapIndex];
    if (!data) return null;

    return {
      mapName: data.map.mapName,
      level: data.map.level,
      mapStrategy: data.map.mapStrategy,
      tasks: data.map.tasks.map((t) => ({
        id: t.id,
        description: t.description,
        tags: t.tags,
        rewardTags: t.rewardTags,
        checked: !!checkedState[t.id], // 附加勾选状态
      })),
    };
  }

  // 地图名称匹配辅助函数
  function matchMapByName(mapNameStr, searchStr) {
    const lower = mapNameStr.toLowerCase();
    const names = lower.split(" / ").map((n) => n.trim());
    const search = searchStr.toLowerCase().trim();
    return (
      lower.includes(search) ||
      search.includes(lower) ||
      names.some(
        (n) => n === search || search.includes(n) || n.includes(search),
      )
    );
  }

  function findMapIndexByTaskId(taskId) {
    if (floatAllMaps.length === 0) flattenMapsForFloat();
    for (let i = 0; i < floatAllMaps.length; i++) {
      const mapData = floatAllMaps[i];
      if (mapData.map.tasks && mapData.map.tasks.some((t) => t.id === taskId)) {
        return i;
      }
    }
    return -1;
  }

  function findMapIndexByName(mapName) {
    if (floatAllMaps.length === 0) flattenMapsForFloat();
    const search = mapName.toLowerCase().trim();

    // 优先精确匹配（避免"皆伐"错误匹配到"皆伐營地"）
    for (let i = 0; i < floatAllMaps.length; i++) {
      const names = floatAllMaps[i].map.mapName
        .toLowerCase()
        .split(" / ")
        .map((n) => n.trim());
      if (names.includes(search)) return i;
    }
    // 回退到模糊匹配
    for (let i = 0; i < floatAllMaps.length; i++) {
      if (matchMapByName(floatAllMaps[i].map.mapName, mapName)) return i;
    }
    return -1;
  }

  function updateFloatWindow(isAutoDetected = false) {
    if (!isFloatWindowOpen) return;
    const data = getCurrentFloatData();
    if (data && window.electronAPI?.updateFloatData) {
      data.isAutoDetected = isAutoDetected; // 添加自动检测标志
      window.electronAPI.updateFloatData(data);
    }
  }

  function initFloatMode() {
    const floatCheckbox = document.getElementById("floatModeCheckbox");
    if (!floatCheckbox) return;

    floatCheckbox.addEventListener("change", (e) => {
      const isOpen = e.target.checked;
      isFloatWindowOpen = isOpen;

      if (isOpen) {
        if (window.electronAPI?.toggleFloatWindow) {
          window.electronAPI.toggleFloatWindow();
          setTimeout(updateFloatWindow, 500);
        }
      } else {
        if (window.electronAPI?.toggleFloatWindow) {
          window.electronAPI.toggleFloatWindow();
        }
      }

      try {
        localStorage.setItem("poe2_float_open", isOpen ? "1" : "0");
      } catch (e) {}
    });

    if (window.electronAPI?.onFloatWindowClosed) {
      window.electronAPI.onFloatWindowClosed(() => {
        isFloatWindowOpen = false;
        floatCheckbox.checked = false;
      });
    }

    if (window.electronAPI?.onFloatNav) {
      window.electronAPI.onFloatNav((direction) => {
        if (direction === "prev") floatMapIndex--;
        else if (direction === "next") floatMapIndex++;
        updateFloatWindow();
        const currentData = getCurrentFloatData();
        if (currentData?.mapName) {
          scrollToMap(currentData.mapName);
        }
        try {
          localStorage.setItem(
            "poe2_float_map_index",
            floatMapIndex.toString(),
          );
        } catch (e) {}
      });
    }

    if (window.electronAPI?.onSyncTaskCheck) {
      window.electronAPI.onSyncTaskCheck(({ taskId, checked }) => {
        if (checked) {
          checkedState[taskId] = true;
        } else {
          delete checkedState[taskId];
        }
        saveChecks();
        renderAll();
      });
    }

    // 地图检测统一处理（主窗口匹配并推送浮窗）
    if (window.electronAPI?.onMapDetected) {
      window.electronAPI.onMapDetected((mapName, isAutoDetected) => {
        console.log("[主窗口] 检测到地图:", mapName, "自动:", isAutoDetected);
        scrollToMap(mapName); // 主窗口滚动
        // 根据检测到的地图更新浮窗索引
        const mapIndex = findMapIndexByName(mapName);
        if (mapIndex !== -1) {
          floatMapIndex = mapIndex;
          updateFloatWindow(isAutoDetected); // 传递自动检测标志
          // 保存当前地图索引
          try {
            localStorage.setItem(
              "poe2_float_map_index",
              floatMapIndex.toString(),
            );
          } catch (e) {}
        }
      });
    }

    // 恢复上次浮窗状态
    try {
      const savedFloat = localStorage.getItem("poe2_float_open");
      if (savedFloat === "1" && window.electronAPI?.toggleFloatWindow) {
        floatCheckbox.checked = true;
        isFloatWindowOpen = true;
        window.electronAPI.toggleFloatWindow();
        setTimeout(updateFloatWindow, 500);
      }
    } catch (e) {}
  }

  // 滚动到指定地图
  function scrollToMap(mapName) {
    if (!mapName) return;
    console.log("[滚动] 开始滚动到:", mapName);

    const search = mapName.toLowerCase().trim();

    // 在 questData 中查找：优先精确匹配，再回退模糊匹配
    function findInQuestData(preferExact) {
      for (let actIdx = 0; actIdx < questData.length; actIdx++) {
        const maps = questData[actIdx].maps;
        for (let mapIdx = 0; mapIdx < maps.length; mapIdx++) {
          const map = maps[mapIdx];
          const names = map.mapName
            .toLowerCase()
            .split(" / ")
            .map((n) => n.trim());
          const matched = preferExact
            ? names.includes(search)
            : matchMapByName(map.mapName, mapName);
          if (matched) return { actIdx, mapIdx, map };
        }
      }
      return null;
    }

    let result = findInQuestData(true) || findInQuestData(false);
    if (!result) {
      console.log("[滚动] 未匹配任何地图");
      return;
    }

    const { actIdx, mapIdx, map } = result;
    console.log(
      "[滚动] 匹配地图:",
      map.mapName,
      "章节:",
      actIdx,
      "索引:",
      mapIdx,
    );
    collapsedActs.delete(actIdx);
    collapsedMaps.delete(`${actIdx}_${mapIdx}`);
    renderAll();
    setTimeout(() => {
      const mapElements = document.querySelectorAll(".map-group");
      let targetMapElement = null;
      const searchLower = mapName.toLowerCase().trim();
      mapElements.forEach((el) => {
        const mapHeader = el.querySelector(".map-header span");
        if (mapHeader) {
          const headerText = mapHeader.textContent
            .replace("🗺️ ", "")
            .toLowerCase();
          const headerNames = headerText.split(" / ").map((n) => n.trim());
          if (
            headerNames.includes(searchLower) ||
            matchMapByName(headerText, mapName)
          ) {
            targetMapElement = el;
          }
        }
      });
      if (targetMapElement) {
        targetMapElement.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
        targetMapElement.style.boxShadow = "0 0 15px rgba(193, 144, 44, 0.6)";
        setTimeout(() => {
          targetMapElement.style.boxShadow = "";
        }, 2000);
      }
    }, 500);
  }

  // ===================== 设置功能 =====================
  // 设置模态框
  const settingsModal = document.getElementById("settingsModal");
  const settingsBtn = document.getElementById("settingsBtn");
  const settingsClose = document.getElementById("settingsClose");
  const addLogPathBtn = document.getElementById("addLogPathBtn");
  const logPathList = document.getElementById("logPathList");

  // 打开设置
  settingsBtn?.addEventListener("click", async () => {
    settingsModal.classList.remove("hidden");
    await renderLogPathList();
  });

  // 关闭设置
  settingsClose?.addEventListener("click", () => {
    settingsModal.classList.add("hidden");
  });

  // 点击模态框背景关闭
  settingsModal?.addEventListener("click", (e) => {
    if (e.target === settingsModal) {
      settingsModal.classList.add("hidden");
    }
  });

  // 添加日志路径
  addLogPathBtn?.addEventListener("click", async () => {
    if (!window.electronAPI?.selectLogFile) {
      showToast("Electron API 不可用");
      return;
    }
    const path = await window.electronAPI.selectLogFile();
    if (path) {
      const result = await window.electronAPI.addLogPath(path);
      if (result.success) {
        showToast("日志路径已添加");
        await renderLogPathList();
      } else {
        showToast(result.error || "添加失败");
      }
    }
  });

  // 渲染日志路径列表
  async function renderLogPathList() {
    if (!window.electronAPI?.getLogPaths) return;

    const paths = await window.electronAPI.getLogPaths();
    logPathList.innerHTML = "";

    if (paths.length === 0) {
      logPathList.innerHTML =
        '<div class="log-path-empty">暂无日志路径，请添加</div>';
      return;
    }

    paths.forEach((item, index) => {
      const itemEl = document.createElement("div");
      itemEl.className = `log-path-item ${item.active ? "active" : ""}`;

      const exists = true; // 简化处理，实际可由主进程检查

      itemEl.innerHTML = `
        <div class="log-path-info">
          <div class="log-path-radio" title="设为活跃">
            <input type="radio" name="activeLogPath" ${item.active ? "checked" : ""} data-path="${escapeHtml(item.path)}">
          </div>
          <div class="log-path-text" title="${escapeHtml(item.path)}">${escapeHtml(item.path)}</div>
        </div>
        <div class="log-path-actions">
          <button class="log-path-delete" data-path="${escapeHtml(item.path)}" title="删除">🗑️</button>
        </div>
      `;

      logPathList.appendChild(itemEl);
    });

    // 绑定活跃选择
    logPathList
      .querySelectorAll('input[name="activeLogPath"]')
      .forEach((radio) => {
        radio.addEventListener("change", async (e) => {
          const path = e.target.dataset.path;
          if (window.electronAPI?.setActiveLogPath) {
            const result = await window.electronAPI.setActiveLogPath(path);
            if (result.success) {
              showToast("已切换到选定日志路径");
              await renderLogPathList();
            } else {
              showToast(result.error || "切换失败");
            }
          }
        });
      });

    // 绑定删除按钮
    logPathList.querySelectorAll(".log-path-delete").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        const path = e.target.dataset.path;
        if (confirm(`确定要删除此日志路径吗?\n${path}`)) {
          if (window.electronAPI?.removeLogPath) {
            const result = await window.electronAPI.removeLogPath(path);
            if (result.success) {
              showToast("日志路径已删除");
              await renderLogPathList();
            } else {
              showToast(result.error || "删除失败");
            }
          }
        }
      });
    });
  }

  // 简单的 HTML 转义
  function escapeHtml(text) {
    if (!text) return "";
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  // Toast 提示
  function showToast(message) {
    const existing = document.querySelector(".toast-message");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.className = "toast-message";
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0, 0, 0, 0.8);
      color: #fff;
      padding: 10px 20px;
      border-radius: 4px;
      z-index: 10000;
      font-size: 14px;
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
  }

  // ===================== 图片地址检测与处理 =====================
  function hasAnyImages(data) {
    if (!data || !Array.isArray(data)) return false;
    return data.some((act) => {
      if (act.images && act.images.length > 0) return true;
      if (act.maps && act.maps.some((m) => m.images && m.images.length > 0))
        return true;
      return false;
    });
  }

  function stripAllImages(data) {
    if (!data || !Array.isArray(data)) return data;
    return data.map((act) => ({
      ...act,
      images: [],
      maps: (act.maps || []).map((m) => ({ ...m, images: [] })),
    }));
  }

  // ===================== 缓存数据导入导出功能 =====================
  const exportCacheBtn = document.getElementById("exportCacheBtn");
  const importCacheBtn = document.getElementById("importCacheBtn");

  // 导出缓存数据
  exportCacheBtn?.addEventListener("click", async () => {
    if (!window.electronAPI?.exportCache) {
      showToast("Electron API 不可用");
      return;
    }

    try {
      // 收集所有缓存数据（图片为本地文件路径）
      const cacheData = {
        version: "1.0",
        exportDate: new Date().toISOString(),
        questData: questData,
        checkedState: checkedState,
        collapsedActs: Array.from(collapsedActs),
        collapsedMaps: Array.from(collapsedMaps),
        showCompletedTasks: Array.from(showCompletedTasks),
        showCompletedMaps: Array.from(showCompletedMaps),
        theme: localStorage.getItem(STORAGE_THEME_KEY) || "dark",
        editMode: editMode,
      };

      // 检测是否有图片地址
      if (hasAnyImages(questData)) {
        if (
          !confirm(
            "检测到数据中包含图片地址，是否一并导出？\n\n注：图片地址为本地文件路径，导入到其他设备可能无法使用。",
          )
        ) {
          cacheData.questData = stripAllImages(questData);
          cacheData.includesImages = false;
        } else {
          cacheData.includesImages = true;
        }
      } else {
        cacheData.includesImages = false;
      }

      console.log("[缓存导出] 导出数据:", JSON.stringify(cacheData, null, 2));
      console.log("[缓存导出] questData 地图数:", questData.length);
      console.log("[缓存导出] 是否包含图片:", cacheData.includesImages);

      const result = await window.electronAPI.exportCache(cacheData);
      if (result.success) {
        showToast("缓存数据已导出");
      } else if (result.error !== "用户取消") {
        showToast(result.error || "导出失败");
      }
    } catch (err) {
      console.error("[缓存导出] 出错:", err);
      showToast("导出出错: " + err.message);
    }
  });

  // 导入缓存数据
  importCacheBtn?.addEventListener("click", async () => {
    if (!window.electronAPI?.importCache) {
      showToast("Electron API 不可用");
      return;
    }

    if (!confirm("导入缓存数据将覆盖当前所有任务进度，确定继续？")) {
      return;
    }

    try {
      const result = await window.electronAPI.importCache();
      if (result.success) {
        const data = result.data;

        // 检测导入数据是否包含图片地址
        let importImages = true;
        if (data.questData && hasAnyImages(data.questData)) {
          importImages = confirm(
            "检测到导入数据中包含图片地址，是否一并导入？\n\n" +
              "注：图片地址为本地文件路径，若当前设备无对应文件将无法显示。",
          );
        }

        // 恢复 questData（任务数据）
        if (data.questData && Array.isArray(data.questData)) {
          questData = importImages
            ? data.questData
            : stripAllImages(data.questData);
          // 保存到 localStorage
          try {
            localStorage.setItem(STORAGE_DATA_KEY, JSON.stringify(questData));
          } catch (e) {
            console.error("保存任务数据失败:", e);
          }
          console.log("[缓存导入] 恢复 questData，章节数:", questData.length);
          console.log("[缓存导入] 是否导入图片:", importImages);
        }

        // 恢复 checkedState
        if (data.checkedState) {
          Object.assign(checkedState, data.checkedState);
          saveChecks();
        }

        // 恢复其他状态
        if (data.collapsedActs) {
          collapsedActs = new Set(data.collapsedActs);
        }
        if (data.collapsedMaps) {
          collapsedMaps = new Set(data.collapsedMaps);
        }
        if (data.showCompletedTasks) {
          showCompletedTasks = new Set(data.showCompletedTasks);
        }
        if (data.showCompletedMaps) {
          showCompletedMaps = new Set(data.showCompletedMaps);
        }

        // 恢复主题
        if (data.theme) {
          localStorage.setItem(STORAGE_THEME_KEY, data.theme);
          const themeCheckbox = document.getElementById("themeCheckbox");
          if (data.theme === "light") {
            document.body.classList.add("light-theme");
            if (themeCheckbox) themeCheckbox.checked = true;
          } else {
            document.body.classList.remove("light-theme");
            if (themeCheckbox) themeCheckbox.checked = false;
          }
        }

        // 恢复编辑模式
        if (data.editMode !== undefined) {
          editMode = data.editMode;
          const editModeCheckbox = document.getElementById("editModeCheckbox");
          if (editModeCheckbox) editModeCheckbox.checked = editMode;
          localStorage.setItem(STORAGE_EDIT_KEY, editMode ? "1" : "0");
        }

        // 重新渲染
        console.log("[缓存导入] 调用 renderAll 前，questData:", questData);
        console.log("[缓存导入] questData 长度:", questData?.length);
        renderAll();
        console.log("[缓存导入] renderAll 调用完成");

        // 计算统计数据
        const chapterCount = questData?.length || 0;
        const mapCount =
          questData?.reduce((sum, act) => sum + (act.maps?.length || 0), 0) ||
          0;
        const taskCount = data.checkedState
          ? Object.keys(data.checkedState).length
          : 0;
        const exportDate = data.exportDate
          ? new Date(data.exportDate).toLocaleString("zh-CN")
          : "未知";

        // 显示详细反馈
        const feedbackMsg =
          `✅ 缓存导入成功！\n` +
          `📅 导出时间: ${exportDate}\n` +
          `📊 章节: ${chapterCount} | 地图: ${mapCount} | 已勾选: ${taskCount}`;
        showToast(feedbackMsg);
      } else if (result.error !== "用户取消") {
        showToast(result.error || "导入失败");
      }
    } catch (err) {
      console.error("[缓存导入] 出错:", err);
      showToast("导入出错: " + err.message);
    }
  });

  // 回到顶部按钮事件
  const backToTopBtn = document.getElementById("backToTopBtn");
  backToTopBtn?.addEventListener("click", () => {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  });

  // 监听滚动显示/隐藏回到顶部按钮
  let scrollTimer = null;
  window.addEventListener("scroll", () => {
    if (scrollTimer) clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      const scrollTop =
        window.pageYOffset || document.documentElement.scrollTop;
      if (scrollTop > 200) {
        backToTopBtn.style.opacity = "1";
        backToTopBtn.style.pointerEvents = "auto";
      } else {
        backToTopBtn.style.opacity = "0.3";
        backToTopBtn.style.pointerEvents = "none";
      }
    }, 50);
  });

  // 初始化按钮状态
  const initialScrollTop =
    window.pageYOffset || document.documentElement.scrollTop;
  if (initialScrollTop <= 200) {
    backToTopBtn.style.opacity = "0.3";
    backToTopBtn.style.pointerEvents = "none";
  }
})();
