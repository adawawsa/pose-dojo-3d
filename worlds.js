"use strict";

(() => {
  const DEFAULT_PRESET = {
    id: "shihan-world",
    name: "師範ワールド",
    version: 1,
    areaLength: [1840, 2080],
    areas: [
      {
        id: "photo-city", name: "写真街", color: "#39eaff", bg: "photoCity", shape: "city",
        mission: "カメラ軍団を蹴散らせ", enemyTypes: ["pen", "bottle"], difficulty: 1,
        platforms: [3, 4], enemies: [3, 4], pickups: [5, 6], gaps: [1, 1], gapWidth: [92, 118], boss: { hp: 4 },
      },
      {
        id: "cable-marsh", name: "コード沼", color: "#9b63ff", bg: "world", shape: "cable",
        mission: "からまるコードを突破せよ", enemyTypes: ["cable", "pen"], difficulty: 1.15,
        platforms: [3, 5], enemies: [3, 5], pickups: [5, 7], gaps: [1, 2], gapWidth: [98, 126], boss: { hp: 4 },
      },
      {
        id: "junk-factory", name: "ガラクタ工場", color: "#ffae27", bg: "arena", shape: "factory",
        mission: "瓶とペンの生産ラインを止めろ", enemyTypes: ["bottle", "pen", "cable"], difficulty: 1.3,
        platforms: [4, 5], enemies: [4, 5], pickups: [5, 7], gaps: [1, 2], gapWidth: [104, 132], boss: { hp: 5 },
      },
      {
        id: "balance-coast", name: "バランス海岸", color: "#e3ff38", bg: "world", shape: "coast",
        mission: "足場から落ちずに走れ", enemyTypes: ["cable", "bottle"], difficulty: 1.45,
        platforms: [4, 6], enemies: [4, 6], pickups: [6, 8], gaps: [2, 2], gapWidth: [108, 138], boss: { hp: 5 },
      },
      {
        id: "shihan-castle", name: "師範城", color: "#ff386c", bg: "world", shape: "castle",
        mission: "最後の師範を殴り倒せ", enemyTypes: ["pen", "cable", "bottle"], difficulty: 1.7,
        platforms: [5, 6], enemies: [5, 6], pickups: [6, 8], gaps: [2, 2], gapWidth: [112, 142], boss: { hp: 9, final: true },
      },
    ],
  };

  function hashSeed(value) {
    const text = String(value ?? Date.now());
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0 || 1;
  }

  function randomFrom(seed) {
    let value = seed >>> 0;
    return () => {
      value += 0x6D2B79F5;
      let result = value;
      result = Math.imul(result ^ (result >>> 15), result | 1);
      result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
      return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
    };
  }

  function range(random, limits) {
    return limits[0] + (limits[1] - limits[0]) * random();
  }

  function integer(random, limits) {
    return Math.floor(range(random, [limits[0], limits[1] + 1]));
  }

  function choose(random, values) {
    return values[Math.floor(random() * values.length)];
  }

  function awayFromGaps(x, gaps, padding = 75) {
    const gap = gaps.find(([left, right]) => x > left - padding && x < right + padding);
    return gap ? gap[1] + padding : x;
  }

  function createWorld(options = {}) {
    const preset = options.preset || DEFAULT_PRESET;
    const seed = Number.isInteger(options.seed) ? (options.seed >>> 0 || 1) : hashSeed(options.seed);
    const random = randomFrom(seed);
    const platforms = [];
    const gaps = [];
    const enemies = [];
    const pickups = [];
    const decorations = [];
    let cursor = 0;

    const areas = preset.areas.map((theme, areaIndex) => {
      const length = Math.round(range(random, theme.length || preset.areaLength) / 20) * 20;
      const start = cursor;
      const end = start + length;
      const areaGaps = [];
      const gapCount = integer(random, theme.gaps || [1, 1]);
      const gapSlots = gapCount === 1 ? [.76] : [.52, .78];

      gapSlots.forEach((slot) => {
        const width = Math.round(range(random, theme.gapWidth || [95, 130]));
        const center = start + length * slot + range(random, [-55, 55]);
        const gap = [Math.round(center - width / 2), Math.round(center + width / 2)];
        areaGaps.push(gap);
        gaps.push(gap);
      });

      const platformCount = integer(random, theme.platforms || [3, 4]);
      for (let index = 0; index < platformCount; index += 1) {
        const progress = (index + 1) / (platformCount + 1);
        const rawX = start + 280 + progress * (length - 620) + range(random, [-70, 70]);
        const width = Math.round(range(random, [170, 275]));
        const x = Math.min(awayFromGaps(rawX, areaGaps, 40), end - 330);
        const heightLane = choose(random, [385, 430, 475, 505]);
        platforms.push({ x: Math.round(x), y: heightLane, w: width, h: 20, area: areaIndex });
      }

      const enemyCount = integer(random, theme.enemies || [3, 4]);
      for (let index = 0; index < enemyCount; index += 1) {
        const progress = (index + 1) / (enemyCount + 1);
        const rawX = start + 430 + progress * (length - 760) + range(random, [-65, 65]);
        enemies.push({
          x: Math.round(Math.min(awayFromGaps(rawX, areaGaps), end - 350)),
          type: choose(random, theme.enemyTypes || ["pen"]),
          speed: range(random, [22, 42]) * (theme.difficulty || 1),
          area: areaIndex,
        });
      }

      if (theme.boss !== false) {
        const boss = theme.boss || {};
        enemies.push({
          x: end - 165,
          type: boss.type || choose(random, theme.enemyTypes || ["pen"]),
          boss: true,
          final: Boolean(boss.final),
          hp: boss.hp || 4 + Math.floor(areaIndex / 2),
          area: areaIndex,
        });
      }

      const pickupCount = integer(random, theme.pickups || [5, 6]);
      for (let index = 0; index < pickupCount; index += 1) {
        const progress = (index + 1) / (pickupCount + 1);
        const rawX = start + 220 + progress * (length - 440) + range(random, [-40, 40]);
        pickups.push({
          id: `${areaIndex}-${index}-${seed}`,
          x: Math.round(awayFromGaps(rawX, areaGaps, 35)),
          y: choose(random, [330, 410, 500]),
          w: 48,
          h: 62,
          photo: ((areaIndex * 2 + index + Math.floor(random() * 3)) % 7) + 1,
          active: true,
          special: false,
          area: areaIndex,
        });
      }

      const decorationCount = Math.max(4, Math.round(length / 360));
      for (let index = 0; index < decorationCount; index += 1) {
        decorations.push({
          x: Math.round(start + 190 + index * ((length - 300) / decorationCount) + range(random, [-45, 45])),
          y: choose(random, [185, 220, 265]),
          photo: ((areaIndex + index) % 7) + 1,
          scale: range(random, [.82, 1.18]),
          area: areaIndex,
        });
      }

      cursor = end;
      return { ...theme, index: areaIndex, start, end, length };
    });

    return {
      id: preset.id,
      name: preset.name,
      version: preset.version,
      seed,
      code: seed.toString(36).toUpperCase().padStart(7, "0").slice(-7),
      length: cursor,
      areas,
      gaps,
      platforms,
      enemies,
      pickups,
      decorations,
    };
  }

  window.ShihanWorldForge = Object.freeze({
    preset: DEFAULT_PRESET,
    createWorld,
    hashSeed,
  });
})();
