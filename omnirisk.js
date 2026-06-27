/* ============================================================
   OmniRisk — клиентский порт движка прогнозирования (раздел плана)
   Самодостаточный: работает в браузере без бэкенда, мат. ядро повторяет
   backend/src/modules/prediction/domain. Экспортируется как window.OmniRisk.
   ============================================================ */
'use strict';
(() => {
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const r1 = (v) => Math.round(v * 10) / 10;

  /* ---------- Каталог болезней (синхронно с disease-catalog.ts) ---------- */
  const DISEASES = [
    { icd11:'BA40', id:'ihd', name:'Ишемическая болезнь сердца', category:'CARDIOVASCULAR', lifetimeBaseline:32, baselineOnsetAge:64, sexFactor:1.4, minAge:30, weights:{ age:4.2, bloodPressure:2.4, lipids:2.8, smoking:2.6, glycemia:1.4, inflammation:1.2, genomicLoad:1.6, inactivity:0.9, adiposity:0.7, autonomic:0.6, cardiac:1.2 } },
    { icd11:'8B20', id:'stroke', name:'Инсульт', category:'CARDIOVASCULAR', lifetimeBaseline:18, baselineOnsetAge:70, sexFactor:1.1, minAge:35, weights:{ age:4.0, bloodPressure:3.2, smoking:1.6, glycemia:1.2, lipids:1.0, genomicLoad:1.2, inflammation:0.8, cardiac:0.6 } },
    { icd11:'BD10', id:'hf', name:'Хроническая сердечная недостаточность', category:'CARDIOVASCULAR', lifetimeBaseline:20, baselineOnsetAge:72, sexFactor:1.1, minAge:40, weights:{ age:3.6, bloodPressure:2.0, glycemia:1.4, adiposity:1.0, inflammation:1.0, autonomic:1.2, cardiac:2.4 } },
    { icd11:'BA00.Z', id:'htn', name:'Артериальная гипертензия (субклин.)', category:'CARDIOVASCULAR', lifetimeBaseline:55, baselineOnsetAge:52, sexFactor:1.05, stage:'subclinical', minAge:25, weights:{ age:3.0, bloodPressure:4.0, adiposity:1.6, alcohol:1.0, stress:0.8, social:0.5 } },
    { icd11:'2C25', id:'lung_ca', name:'Рак лёгкого', category:'ONCOLOGY', lifetimeBaseline:6, baselineOnsetAge:68, sexFactor:1.3, minAge:40, weights:{ age:3.4, smoking:4.6, environment:1.6, genomicLoad:1.2, inflammation:0.8 } },
    { icd11:'2C61', id:'breast_ca', name:'Рак молочной железы', category:'ONCOLOGY', lifetimeBaseline:12, baselineOnsetAge:62, sexFactor:0.1, minAge:30, weights:{ age:3.0, genomicLoad:2.8, adiposity:1.0, alcohol:1.0 } },
    { icd11:'2C10', id:'colorectal_ca', name:'Колоректальный рак', category:'ONCOLOGY', lifetimeBaseline:5, baselineOnsetAge:67, sexFactor:1.2, minAge:40, weights:{ age:3.2, adiposity:1.4, diet:1.6, inactivity:1.0, alcohol:1.0, microbiome:1.2, genomicLoad:1.4 } },
    { icd11:'2C82', id:'prostate_ca', name:'Рак предстательной железы', category:'ONCOLOGY', lifetimeBaseline:11, baselineOnsetAge:70, sexFactor:2.0, minAge:45, weights:{ age:3.6, genomicLoad:2.4, diet:0.8 } },
    { icd11:'5A11', id:'t2dm', name:'Сахарный диабет 2 типа', category:'ENDOCRINE', lifetimeBaseline:28, baselineOnsetAge:58, sexFactor:1.05, minAge:25, weights:{ glycemia:4.4, adiposity:3.0, inactivity:1.4, diet:1.2, age:1.6, genomicLoad:1.4, inflammation:0.8 } },
    { icd11:'5A11.Z', id:'prediabetes', name:'Предиабет (субклин.)', category:'ENDOCRINE', lifetimeBaseline:38, baselineOnsetAge:48, sexFactor:1.0, stage:'subclinical', minAge:20, weights:{ glycemia:4.8, adiposity:2.6, inactivity:1.4, diet:1.2, age:1.0 } },
    { icd11:'5A00', id:'hypothyroid', name:'Гипотиреоз', category:'ENDOCRINE', lifetimeBaseline:10, baselineOnsetAge:50, sexFactor:0.3, minAge:20, weights:{ age:1.6, immune:1.4, genomicLoad:1.2 } },
    { icd11:'FB83.0', id:'osteoporosis', name:'Остеопороз', category:'MUSCULOSKELETAL', lifetimeBaseline:15, baselineOnsetAge:66, sexFactor:0.4, minAge:45, weights:{ age:3.2, inactivity:1.2, smoking:1.0, diet:0.8, alcohol:0.6 } },
    { icd11:'FA20', id:'ra', name:'Ревматоидный артрит', category:'AUTOIMMUNE', lifetimeBaseline:3, baselineOnsetAge:50, sexFactor:0.4, minAge:20, weights:{ immune:2.4, inflammation:2.0, genomicLoad:2.0, smoking:1.4, microbiome:1.0 } },
    { icd11:'4A40', id:'sle', name:'Системная красная волчанка', category:'AUTOIMMUNE', lifetimeBaseline:1, baselineOnsetAge:35, sexFactor:0.15, minAge:15, weights:{ immune:2.6, inflammation:2.0, genomicLoad:2.4, environment:1.0 } },
    { icd11:'CA40', id:'severe_resp_infection', name:'Тяжёлая респираторная инфекция', category:'INFECTIOUS', lifetimeBaseline:14, baselineOnsetAge:60, sexFactor:1.1, minAge:0, weights:{ age:3.0, immune:2.0, smoking:1.4, environment:1.0, glycemia:0.8, inflammation:0.8 } },
    { icd11:'8A20', id:'alzheimer', name:'Болезнь Альцгеймера', category:'NEUROLOGICAL', lifetimeBaseline:11, baselineOnsetAge:76, sexFactor:0.8, minAge:50, weights:{ age:4.6, genomicLoad:2.6, bloodPressure:1.2, glycemia:1.2, inactivity:1.0, social:1.0, inflammation:1.0 } },
    { icd11:'8A00', id:'parkinson', name:'Болезнь Паркинсона', category:'NEUROLOGICAL', lifetimeBaseline:3, baselineOnsetAge:72, sexFactor:1.5, minAge:45, weights:{ age:4.0, genomicLoad:2.0, environment:1.6, microbiome:1.0 } },
    { icd11:'6A70', id:'depression', name:'Депрессивное расстройство', category:'PSYCHIATRIC', lifetimeBaseline:20, baselineOnsetAge:38, sexFactor:0.6, minAge:12, weights:{ stress:2.6, social:2.0, sleep:1.6, genomicLoad:1.4, inflammation:1.0, inactivity:0.8 } },
    { icd11:'CA22', id:'copd', name:'ХОБЛ', category:'RESPIRATORY', lifetimeBaseline:10, baselineOnsetAge:66, sexFactor:1.2, minAge:40, weights:{ smoking:4.4, age:2.6, environment:1.8, inflammation:1.0 } },
    { icd11:'CA23', id:'asthma', name:'Бронхиальная астма', category:'RESPIRATORY', lifetimeBaseline:8, baselineOnsetAge:30, sexFactor:0.9, minAge:0, weights:{ immune:1.8, environment:2.0, genomicLoad:1.4, inflammation:1.2 } },
    { icd11:'DA42', id:'pud', name:'Язвенная болезнь', category:'GASTROINTESTINAL', lifetimeBaseline:8, baselineOnsetAge:48, sexFactor:1.2, minAge:18, weights:{ smoking:1.6, alcohol:1.6, stress:1.2, microbiome:1.4, inflammation:0.8 } },
    { icd11:'DB92', id:'nafld', name:'Неалкогольная жировая болезнь печени', category:'HEPATIC', lifetimeBaseline:25, baselineOnsetAge:52, sexFactor:1.1, minAge:20, weights:{ adiposity:3.2, glycemia:2.4, hepatic:2.0, lipids:1.4, inactivity:1.0, alcohol:0.8 } },
    { icd11:'DB99', id:'cirrhosis', name:'Цирроз печени', category:'HEPATIC', lifetimeBaseline:4, baselineOnsetAge:60, sexFactor:1.4, minAge:30, weights:{ alcohol:3.6, hepatic:2.8, adiposity:1.2, glycemia:1.0, inflammation:1.0 } },
    { icd11:'GB61', id:'ckd', name:'Хроническая болезнь почек', category:'RENAL', lifetimeBaseline:14, baselineOnsetAge:64, sexFactor:1.0, minAge:30, weights:{ renal:4.2, bloodPressure:2.0, glycemia:2.2, age:1.8, inflammation:0.8 } },
    { icd11:'9B10', id:'amd', name:'Возрастная макулодистрофия', category:'OPHTHALMIC', lifetimeBaseline:9, baselineOnsetAge:72, sexFactor:0.9, minAge:50, weights:{ age:3.8, smoking:2.0, genomicLoad:1.8, lipids:0.8 } },
    { icd11:'2C30', id:'melanoma', name:'Меланома кожи', category:'DERMATOLOGIC', lifetimeBaseline:2, baselineOnsetAge:58, sexFactor:1.1, minAge:20, weights:{ environment:2.4, genomicLoad:2.0, age:1.6, immune:0.8 } },
    { icd11:'3A00', id:'anemia', name:'Хроническая анемия', category:'HEMATOLOGIC', lifetimeBaseline:12, baselineOnsetAge:55, sexFactor:0.7, minAge:12, weights:{ hematologic:3.5, immune:1.2, renal:1.4, diet:1.2, inflammation:1.0, age:1.0 } },
    { icd11:'5C50.0', id:'fh', name:'Семейная гиперхолестеринемия', category:'RARE', lifetimeBaseline:0.4, baselineOnsetAge:40, sexFactor:1.0, minAge:5, weights:{ genomicLoad:4.0, lipids:3.0 } },
  ];

  const CATEGORY_LABELS = {
    CARDIOVASCULAR:'Сердечно-сосудистые', ONCOLOGY:'Онкологические', ENDOCRINE:'Эндокринные',
    AUTOIMMUNE:'Аутоиммунные', INFECTIOUS:'Инфекционные', NEUROLOGICAL:'Неврологические',
    PSYCHIATRIC:'Психические', GENETIC:'Генетические', MUSCULOSKELETAL:'Опорно-двигательные',
    RESPIRATORY:'Дыхательные', GASTROINTESTINAL:'ЖКТ', HEPATIC:'Печёночные', RENAL:'Почечные',
    OPHTHALMIC:'Офтальмологические', DERMATOLOGIC:'Кожные', HEMATOLOGIC:'Гематологические', RARE:'Редкие/орфанные',
  };
  const SIGNAL_LABELS = {
    age:'Возраст', bioAgeAccel:'Биол. возраст (ускорение)', bloodPressure:'Артериальное давление',
    lipids:'Липидный профиль', glycemia:'Гликемия', adiposity:'Ожирение/ИМТ', renal:'Почечная функция',
    hepatic:'Печёночная функция', hematologic:'Гематология (кровь/ОАК)', cardiac:'Кардиомаркеры (тропонин/BNP)',
    inflammation:'Хроническое воспаление', immune:'Иммунный статус',
    genomicLoad:'Геномная нагрузка', microbiome:'Микробиом', smoking:'Курение', alcohol:'Алкоголь',
    inactivity:'Гиподинамия', diet:'Качество питания', sleep:'Сон', stress:'Стресс',
    environment:'Экология/среда', social:'Социальные факторы', autonomic:'Вегетативный тонус (ВСР)',
  };
  const NON_MODIFIABLE = new Set(['age','genomicLoad','prs','monogenic','family','sex','bioAgeAccel']);
  const isModifiable = (s) => !NON_MODIFIABLE.has(s);

  /* ---------- Нормировка профиля (feature-space.ts) ---------- */
  const pressure = (v, opt, per, cap = 3) => (v === undefined || Number.isNaN(v)) ? 0 : clamp((v - opt) * per, -1, cap);
  const protLow = (v, opt, per) => v === undefined ? 0 : clamp((v - opt) * per, -1.5, 1);

  function normalizeProfile(p) {
    const labs = p.labs || {}, life = p.lifestyle || {}, wear = p.wearables || {}, epi = p.epigenetic || {};
    const prot = p.proteomic || {}, meta = p.metabolomic || {}, micro = p.microbiome || {}, env = p.environmental || {}, soc = p.social || {};
    const present = [];
    const mark = (o, n) => { if (o && Object.keys(o).length) present.push(n); };
    ['genomic','epigenetic','proteomic','metabolomic','microbiome','labs','imaging','lifestyle','wearables','family','social','environmental']
      .forEach((k) => mark(p[k], k));

    const telomerePenalty = epi.telomerePercentile !== undefined ? (50 - epi.telomerePercentile) / 12 : 0;
    const bioAgeAccel = (epi.methylationAgeAccel || 0) + telomerePenalty + (epi.agingRate !== undefined ? (epi.agingRate - 1) * 6 : 0);

    const prs = (p.genomic && p.genomic.prs) || {};
    const prsVals = Object.values(prs).filter((v) => typeof v === 'number');
    const prsMean = prsVals.length ? prsVals.reduce((a, b) => a + b, 0) / prsVals.length : 0;
    const monoN = (p.genomic && p.genomic.monogenic && p.genomic.monogenic.length) || 0;
    const genomicLoad = clamp(prsMean * 0.6 + monoN * 0.8, -1, 3);

    // Воспаление: вч-СРБ + ИЛ-6 + дисбиоз + нейтрофил-лимфоцитарное отношение (NLR) + СОЭ.
    const nlr = (labs.neutrophils !== undefined && labs.lymphocytes !== undefined && labs.lymphocytes > 0) ? labs.neutrophils / labs.lymphocytes : undefined;
    const inflammation = clamp(pressure(prot.crp, 1, 0.25) + pressure(prot.il6, 2, 0.12) + (micro.dysbiosisIndex || 0) / 60 + (nlr !== undefined ? clamp((nlr - 2) * 0.18, -0.2, 1.5) : 0) + pressure(labs.esr, 8, 0.03), -0.5, 3);

    // Гематология: анемия (низкий Hb/Hct, с учётом пола) + аномалии тромбоцитов.
    const hbOptimal = p.sex === 'FEMALE' ? 135 : p.sex === 'MALE' ? 150 : 140;
    const hctOptimal = p.sex === 'FEMALE' ? 41 : p.sex === 'MALE' ? 45 : 43;
    const anemiaPressure = (labs.hemoglobin !== undefined ? clamp((hbOptimal - labs.hemoglobin) * 0.045, -0.4, 3) : 0) + (labs.hematocrit !== undefined ? clamp((hctOptimal - labs.hematocrit) * 0.05, -0.3, 2) : 0);
    const plateletPressure = labs.platelets !== undefined ? clamp((Math.abs(labs.platelets - 275) - 125) * 0.006, 0, 1.5) : 0;
    const hematologic = clamp(anemiaPressure + plateletPressure * 0.5, -0.5, 3);

    // Кардиомаркеры повреждения миокарда: вч-тропонин (<14 нг/л), NT-proBNP (<125 пг/мл).
    const cardiac = clamp((prot.troponin !== undefined ? clamp((prot.troponin - 14) * 0.03, 0, 2) : 0) + (prot.ntProBnp !== undefined ? clamp((prot.ntProBnp - 125) * 0.0025, 0, 2) : 0), 0, 3);

    // Артериальное давление: систолическое + диастолическое (среднее при наличии обоих).
    const sbpP = labs.systolicBp !== undefined ? pressure(labs.systolicBp, 120, 0.03) : undefined;
    const dbpP = labs.diastolicBp !== undefined ? pressure(labs.diastolicBp, 80, 0.045) : undefined;
    const bloodPressure = (sbpP !== undefined && dbpP !== undefined) ? clamp((sbpP + dbpP) / 2, -1, 3) : (sbpP !== undefined ? sbpP : (dbpP !== undefined ? dbpP : 0));

    const signals = {
      age: clamp((p.ageYears - 30) / 22, -1, 3),
      bioAgeAccel,
      bloodPressure,
      lipids: clamp(pressure(labs.ldl, 2.6, 0.5) + pressure(labs.totalChol, 5.0, 0.2) + pressure(meta.triglycerides, 1.5, 0.25) - protLow(labs.hdl, 1.4, 0.5), -1, 3),
      glycemia: clamp(pressure(labs.hba1c, 5.4, 0.7) + pressure(meta.glucoseFasting, 5.5, 0.4) + pressure(meta.homaIr, 2, 0.2), -1, 3),
      adiposity: pressure(labs.bmi, 23, 0.12),
      renal: clamp((labs.egfr !== undefined ? (95 - labs.egfr) * 0.03 : 0) + (meta.uricAcid !== undefined ? clamp((meta.uricAcid - 360) * 0.002, -0.2, 1) : 0), -0.3, 3),
      hepatic: clamp(pressure(labs.alt, 30, 0.03) + (p.imaging && p.imaging.hepaticSteatosis ? 0.8 : 0), -0.3, 3),
      hematologic,
      cardiac,
      inflammation,
      immune: clamp(pressure(labs.wbc, 6, 0.08), -0.5, 2),
      genomicLoad,
      microbiome: micro.diversityShannon !== undefined ? clamp((3.5 - micro.diversityShannon) * 0.4, -0.5, 2) : (micro.dysbiosisIndex || 0) / 60,
      smoking: life.smokingStatus === 'CURRENT' ? clamp(1.6 + (life.packYears || 0) * 0.02, 0, 3) : life.smokingStatus === 'FORMER' ? 0.5 : 0,
      alcohol: pressure(life.alcoholUnitsPerWeek, 4, 0.06),
      inactivity: clamp(0.8 - (life.activityPerWeek || 0) * 0.3, -1, 1.5),
      diet: life.dietQuality !== undefined ? clamp((60 - life.dietQuality) / 40, -1, 1.5) : 0,
      sleep: life.sleepHours !== undefined ? clamp(Math.abs(life.sleepHours - 7.5) * 0.25, 0, 1.5) : 0,
      stress: clamp(((life.stressLevel === undefined ? 3 : life.stressLevel) - 3) * 0.18, -0.5, 1.5),
      environment: clamp(pressure(env.airPm25, 5, 0.04) + (env.occupationalHazard || 0) * 0.06, -0.2, 2),
      social: clamp((soc.incomeBracket !== undefined ? (3 - soc.incomeBracket) * 0.18 : 0) + (soc.isolated ? 0.5 : 0) + (soc.educationYears !== undefined ? (12 - soc.educationYears) * 0.04 : 0), -0.6, 1.5),
      autonomic: clamp(pressure(wear.restingHr, 60, 0.03) + (wear.hrv !== undefined ? (50 - wear.hrv) * 0.015 : 0) + (wear.spo2 !== undefined ? clamp((96 - wear.spo2) * 0.1, -0.2, 1.5) : 0) + (wear.vo2max !== undefined ? clamp((35 - wear.vo2max) * 0.02, -0.6, 1) : 0), -0.5, 2),
    };
    return {
      ageYears: p.ageYears, sex: p.sex, signals, prs,
      monogenic: (p.genomic && p.genomic.monogenic) || [],
      family: (p.family && p.family.affected) || {},
      completeness: clamp(present.length / 12, 0.1, 1),
      modalitiesPresent: present,
    };
  }

  /* ---------- Слой 1: трансформер ---------- */
  function transformerLayer(profile, d) {
    const contributions = []; let lp = 0;
    for (const key in d.weights) {
      const sv = profile.signals[key] || 0;
      const c = sv * d.weights[key] * 0.1;
      if (Math.abs(c) < 1e-6) continue;
      lp += c; contributions.push({ signal: key, label: SIGNAL_LABELS[key], value: c, modifiable: isModifiable(key) });
    }
    const prsZ = profile.prs[d.category];
    if (typeof prsZ === 'number' && prsZ !== 0) { const c = prsZ * 0.22; lp += c; contributions.push({ signal:'prs', label:`PRS · ${d.category}`, value:c, modifiable:false }); }
    if (profile.monogenic.length && (d.category === 'RARE' || d.category === 'ONCOLOGY' || d.category === 'CARDIOVASCULAR')) {
      const c = Math.min(profile.monogenic.length, 3) * 0.35; lp += c; contributions.push({ signal:'monogenic', label:`Моногенные варианты (${profile.monogenic.length})`, value:c, modifiable:false });
    }
    const aff = profile.family[d.category] || 0;
    if (aff > 0) { const c = Math.min(aff, 3) * 0.18; lp += c; contributions.push({ signal:'family', label:`Семейный анамнез (${aff})`, value:c, modifiable:false }); }
    let sexAdj = 0;
    if (d.sexFactor !== 1) sexAdj = profile.sex === 'MALE' ? Math.log(d.sexFactor) : profile.sex === 'FEMALE' ? Math.log(1 / d.sexFactor) : 0;
    if (sexAdj !== 0) { lp += sexAdj; contributions.push({ signal:'sex', label:'Пол', value:sexAdj, modifiable:false }); }
    return { disease: d, lp, contributions, temporalAccel: 1 };
  }

  /* ---------- Слой 2: граф механизмов ---------- */
  const MECHANISMS = [
    { label:'Системное воспаление', act:(p)=>p.signals.inflammation, edges:{ CARDIOVASCULAR:0.18, ONCOLOGY:0.16, NEUROLOGICAL:0.14, AUTOIMMUNE:0.2, HEPATIC:0.12, RENAL:0.1 } },
    { label:'Инсулинорезистентность', act:(p)=>(p.signals.glycemia+p.signals.adiposity)/2, edges:{ ENDOCRINE:0.22, CARDIOVASCULAR:0.14, HEPATIC:0.18, ONCOLOGY:0.08, RENAL:0.1 } },
    { label:'Эндотелиальная дисфункция', act:(p)=>(p.signals.bloodPressure+p.signals.lipids)/2, edges:{ CARDIOVASCULAR:0.2, RENAL:0.14, OPHTHALMIC:0.1, NEUROLOGICAL:0.08 } },
    { label:'Геномная предрасположенность', act:(p)=>p.signals.genomicLoad, edges:{ ONCOLOGY:0.12, CARDIOVASCULAR:0.08, AUTOIMMUNE:0.12, NEUROLOGICAL:0.1, RARE:0.2 } },
    { label:'Клеточное старение', act:(p)=>Math.max(0,p.signals.bioAgeAccel)/8, edges:{ CARDIOVASCULAR:0.1, ONCOLOGY:0.12, NEUROLOGICAL:0.14, MUSCULOSKELETAL:0.12, OPHTHALMIC:0.1 } },
    { label:'Вегетативный дисбаланс', act:(p)=>p.signals.autonomic, edges:{ CARDIOVASCULAR:0.1, PSYCHIATRIC:0.1 } },
  ];
  function graphLayer(scores, profile) {
    const active = MECHANISMS.map((m) => ({ m, a: Math.max(0, m.act(profile)) }));
    return scores.map((s) => {
      let boost = 0; const detail = [];
      for (const { m, a } of active) { const e = m.edges[s.disease.category]; if (!e || a <= 0) continue; const c = a * e; boost += c; if (c > 0.02) detail.push(m.label); }
      if (boost <= 1e-6) return s;
      return Object.assign({}, s, { lp: s.lp + boost, contributions: s.contributions.concat([{ signal:'graph', label:`Граф механизмов: ${detail.slice(0,2).join(', ') || 'связанные процессы'}`, value:boost, modifiable:true }]) });
    });
  }

  /* ---------- Слой 4: выживаемость ---------- */
  const HORIZONS = [1, 3, 5, 10, 20];
  function baselineCumulative(d, age) {
    const minAge = d.minAge || 0; if (age <= minAge) return 0;
    const shape = 4.5, scale = d.baselineOnsetAge - minAge, t = (age - minAge) / Math.max(1, scale);
    const lifetimeFrac = d.lifetimeBaseline / 100;
    const far = (d.baselineOnsetAge + 25 - minAge) / Math.max(1, scale);
    const norm = 1 - Math.exp(-Math.pow(far, shape));
    return clamp((1 - Math.exp(-Math.pow(t, shape))) / norm * lifetimeFrac, 0, lifetimeFrac);
  }
  const survivalToAge = (age) => clamp(Math.exp(-0.00002 * (Math.exp(0.085 * age) - 1)), 0, 1);
  function levelFrom(p10, rr) { const s = p10 + (rr - 1) * 6; if (s >= 35 || rr >= 4) return 'CRITICAL'; if (s >= 18) return 'HIGH'; if (s >= 7) return 'MEDIUM'; return 'LOW'; }

  function survivalLayer(score, ageNow, completeness) {
    const d = score.disease, hr = Math.exp(score.lp) * score.temporalAccel, rr = r1(clamp(hr, 0.1, 60));
    const baseNow = baselineCumulative(d, ageNow);
    const probWithin = (dt) => {
      const ageThen = ageNow + dt, deltaBase = Math.max(0, baselineCumulative(d, ageThen) - baseNow);
      const hazardScaled = 1 - Math.pow(1 - clamp(deltaBase, 0, 0.999), hr);
      const surv = survivalToAge(ageThen) / Math.max(1e-6, survivalToAge(ageNow));
      return clamp(hazardScaled * surv * 100, 0, 99);
    };
    const ciFor = (p) => { const rel = 0.16 + (1 - completeness) * 0.45, half = clamp(p * rel + 1.2, 1.2, 30); return [r1(Math.max(0, p - half)), r1(Math.min(99, p + half))]; };
    const horizons = HORIZONS.map((y) => { const p = r1(probWithin(y)); return { years: y, probability: p, ci: ciFor(p) }; });
    const lifetimeP = r1(probWithin(Math.max(5, 95 - ageNow)));
    horizons.push({ years:'lifetime', probability:lifetimeP, ci:ciFor(lifetimeP) });
    let onsetAgeEstimate = null; const target = lifetimeP / 2;
    if (target > 0.5) for (let dt = 1; dt <= 95 - ageNow; dt++) if (probWithin(dt) >= target) { onsetAgeEstimate = ageNow + dt; break; }
    const p10 = horizons.find((h) => h.years === 10).probability;
    return { id:d.id, icd11:d.icd11, name:d.name, category:d.category, stage:d.stage, lifetimeRisk:lifetimeP, onsetAgeEstimate, riskLevel:levelFrom(p10, rr), horizons, relativeRisk:rr };
  }

  /* ---------- Слой 5: причинность ---------- */
  function causalLayer(score) {
    const pos = score.contributions.filter((c) => c.value > 0), total = pos.reduce((a, c) => a + c.value, 0) || 1;
    const drivers = pos.map((c) => ({ label:c.label, contribution:Math.round(c.value/total*1000)/1000, causal:c.modifiable, counterfactualReductionPct: c.modifiable ? Math.round((1 - Math.exp(-c.value)) * 1000) / 10 : 0 })).sort((a, b) => b.contribution - a.contribution);
    const modShare = pos.filter((c) => c.modifiable).reduce((a, c) => a + c.value, 0) / total;
    return { diseaseId:score.disease.id, drivers, modifiableSharePct:Math.round(modShare * 1000) / 10 };
  }

  /* ---------- Слой 6: объяснимость + attention ---------- */
  const MODALITY_OF = { age:'Демография', sex:'Демография', bioAgeAccel:'Эпигенетика', prs:'Геном', monogenic:'Геном', genomicLoad:'Геном', family:'Семейный анамнез', bloodPressure:'Лаборатория/витальные', lipids:'Метаболомика', glycemia:'Метаболомика', adiposity:'Антропометрия', renal:'Лаборатория', hepatic:'Лаборатория', hematologic:'Лаборатория', cardiac:'Протеомика', inflammation:'Протеомика', immune:'Иммунология', microbiome:'Микробиом', smoking:'Образ жизни', alcohol:'Образ жизни', inactivity:'Образ жизни', diet:'Образ жизни', sleep:'Носимые устройства', stress:'Образ жизни', environment:'Экология', social:'Социальные факторы', autonomic:'Носимые устройства', graph:'Граф механизмов' };
  function explain(score) {
    const shap = score.contributions.map((c) => ({ feature:c.label, value:Math.round(c.value*1000)/1000, modifiable:c.modifiable })).sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
    const byMod = {};
    score.contributions.forEach((c) => { const m = MODALITY_OF[c.signal] || 'Прочее'; byMod[m] = (byMod[m] || 0) + Math.abs(c.value); });
    const total = Object.values(byMod).reduce((a, b) => a + b, 0) || 1;
    const attention = Object.keys(byMod).map((m) => ({ modality:m, weight:Math.round(byMod[m]/total*1000)/1000 })).sort((a, b) => b.weight - a.weight);
    return { diseaseId:score.disease.id, shap, attention };
  }

  /* ---------- Продолжительность жизни ---------- */
  const MORT_W = { ihd:1, stroke:0.9, hf:0.8, lung_ca:1, colorectal_ca:0.7, breast_ca:0.6, prostate_ca:0.5, t2dm:0.6, ckd:0.7, copd:0.7, cirrhosis:0.8, alzheimer:0.8, parkinson:0.6 };
  const DIS_W = { stroke:1, alzheimer:1, parkinson:0.9, osteoporosis:0.7, ckd:0.6, hf:0.6, copd:0.6, depression:0.7, amd:0.5 };
  function lifeExpectancy(profile, preds, modShareAvg) {
    const byId = {}; preds.forEach((p) => byId[p.id] = p);
    const p10 = (p) => p ? p.horizons.find((h) => h.years === 10).probability : 0;
    let excess = 0, wsum = 0;
    for (const id in MORT_W) { const p = byId[id]; if (!p) continue; excess += MORT_W[id] * Math.max(0, p.relativeRisk - 1) * p10(p) / 100; wsum += MORT_W[id]; }
    const exMort = wsum ? excess / wsum : 0, bioAccel = profile.signals.bioAgeAccel;
    const le = r1(clamp(83 - exMort * 9 - Math.max(0, bioAccel) * 0.5, profile.ageYears + 1, 100));
    const lb = (profile.signals.smoking + profile.signals.adiposity + profile.signals.inactivity + profile.signals.glycemia) / 4;
    const hs = r1(clamp(le - 9 - Math.max(0, lb) * 4, profile.ageYears, le));
    const yoll = r1(clamp((83 - le) * clamp(modShareAvg / 100, 0, 1), 0, 25));
    let disLoad = 0; for (const id in DIS_W) { const p = byId[id]; if (!p) continue; disLoad += DIS_W[id] * p10(p) / 100; }
    return { lifeExpectancy:le, healthspan:hs, yearsOfLifeLostModifiable:yoll, disabilityRisk10y:r1(clamp((1 - Math.exp(-disLoad)) * 100, 0, 95)), biologicalAge:Math.round(profile.ageYears + clamp(bioAccel, -10, 20)) };
  }

  /* ---------- Цифровой двойник ---------- */
  const TWIN_LABELS = { cardiovascular:'Сердечно-сосудистая', endocrine:'Эндокринная', immune:'Иммунная', nervous:'Нервная', microbiome:'Микробиом', metabolic:'Метаболизм', renal:'Почечная', hepatic:'Печёночная' };
  const SYS_DRIVERS = {
    cardiovascular:{ bloodPressure:1, lipids:0.9, smoking:0.8, glycemia:0.5, autonomic:0.5, inflammation:0.4, age:0.6, cardiac:0.7 },
    endocrine:{ glycemia:1.2, adiposity:0.9, inactivity:0.5, diet:0.4 },
    immune:{ inflammation:1, immune:0.8, microbiome:0.5, age:0.4, stress:0.4, hematologic:0.4 },
    nervous:{ age:0.8, bloodPressure:0.4, glycemia:0.4, stress:0.6, sleep:0.5, social:0.5, genomicLoad:0.4 },
    microbiome:{ microbiome:1.2, diet:0.7, inflammation:0.4 },
    metabolic:{ adiposity:1, glycemia:1, lipids:0.6, inactivity:0.6, diet:0.5 },
    renal:{ renal:1.4, bloodPressure:0.7, glycemia:0.6, age:0.4 },
    hepatic:{ hepatic:1.2, adiposity:0.8, alcohol:0.9, glycemia:0.5 },
  };
  const COUPLING = [['metabolic','cardiovascular',0.25],['metabolic','hepatic',0.2],['metabolic','renal',0.18],['cardiovascular','renal',0.15],['cardiovascular','nervous',0.12],['immune','microbiome',0.15],['microbiome','immune',0.15],['endocrine','metabolic',0.2]];
  function sysHealth(signals, sys) { let dmg = 0; const dr = SYS_DRIVERS[sys]; for (const s in dr) dmg += Math.max(0, signals[s] || 0) * dr[s]; return clamp(100 - dmg * 14, 5, 100); }
  function twinStep(state, aging) { const next = Object.assign({}, state); for (const s in next) next[s] = clamp(next[s] - aging, 5, 100); for (const [f, t, k] of COUPLING) next[t] = clamp(next[t] - (100 - state[f]) * k * 0.02, 5, 100); return next; }
  const twinOverall = (s) => r1(Object.values(s).reduce((a, b) => a + b, 0) / Object.keys(s).length);
  function twinProject(start, aging, years) { const pts = []; let st = Object.assign({}, start); for (let y = 0; y <= years; y++) { if (y > 0) st = twinStep(st, aging); if (y % 2 === 0) { const sysR = {}; for (const k in st) sysR[k] = r1(st[k]); pts.push({ yearOffset:y, systems:sysR, overall:twinOverall(st) }); } } return pts; }
  function digitalTwin(profile) {
    const systems = Object.keys(TWIN_LABELS), start = {};
    systems.forEach((s) => start[s] = sysHealth(profile.signals, s));
    const current = systems.map((s) => ({ system:s, label:TWIN_LABELS[s], health:r1(start[s]) }));
    const aging = clamp(0.6 + Math.max(0, profile.signals.bioAgeAccel) * 0.08, 0.4, 2.2);
    const optStart = {}; systems.forEach((s) => optStart[s] = clamp(start[s] + (100 - start[s]) * 0.45, 5, 100));
    return { current, overallNow:twinOverall(start), baselineTrajectory:twinProject(start, aging, 10), optimizedTrajectory:twinProject(optStart, clamp(aging * 0.6, 0.3, 1.5), 10) };
  }

  /* ---------- Слой 6: fusion ---------- */
  function fusion(preds, profile) {
    const p10 = (p) => p.horizons.find((h) => h.years === 10).probability;
    const sorted = preds.slice().sort((a, b) => p10(b) - p10(a));
    const burden = sorted.slice(0, 6).reduce((a, p) => a + p10(p), 0) / 6;
    const healthIndex = r1(clamp(100 - burden * 1.1 - Math.max(0, profile.signals.bioAgeAccel) * 0.8, 1, 100));
    const dmax = (cats) => { const v = preds.filter((p) => cats.includes(p.category)).map(p10); return v.length ? r1(Math.max.apply(null, v)) : 0; };
    return { healthIndex, confidence:Math.round((0.35 + 0.6 * profile.completeness) * 100) / 100, topRisks:sorted.slice(0, 8),
      domains:{ cardiovascular:dmax(['CARDIOVASCULAR']), metabolic:dmax(['ENDOCRINE']), oncologic:dmax(['ONCOLOGY']), neuro:dmax(['NEUROLOGICAL','PSYCHIATRIC']), renal:dmax(['RENAL']), respiratory:dmax(['RESPIRATORY']) } };
  }

  /* ---------- Оркестратор ---------- */
  function runOmniRisk(profile) {
    const norm = normalizeProfile(profile);
    let scores = DISEASES.map((d) => transformerLayer(norm, d));
    scores = graphLayer(scores, norm);
    const preds = scores.map((s) => survivalLayer(s, norm.ageYears, norm.completeness));
    const p10 = (p) => p.horizons.find((h) => h.years === 10).probability;
    const top = preds.slice().sort((a, b) => p10(b) - p10(a)).slice(0, 12).map((p) => p.id);
    const causal = {}, explanations = {}; let modSum = 0, modN = 0;
    scores.forEach((s) => { if (top.indexOf(s.disease.id) < 0) return; const c = causalLayer(s); causal[s.disease.id] = c; explanations[s.disease.id] = explain(s); modSum += c.modifiableSharePct; modN++; });
    const modAvg = modN ? modSum / modN : 0;
    const fus = fusion(preds, norm);
    return {
      modelVersion:'omnirisk-1.0.0', ageYears:norm.ageYears, sex:norm.sex,
      healthIndex:fus.healthIndex, confidence:fus.confidence, completeness:norm.completeness, modalitiesPresent:norm.modalitiesPresent,
      lifeExpectancy:lifeExpectancy(norm, preds, modAvg), fusion:fus,
      predictions:preds.slice().sort((a, b) => p10(b) - p10(a)),
      causal, explanations, digitalTwin:digitalTwin(norm),
    };
  }

  function deepMerge(base, ov) {
    if (typeof base !== 'object' || base === null || Array.isArray(base)) return ov === undefined ? base : ov;
    const out = Object.assign({}, base);
    for (const k in ov) { if (ov[k] === undefined) continue; out[k] = (typeof base[k] === 'object' && base[k] && !Array.isArray(base[k]) && typeof ov[k] === 'object') ? deepMerge(base[k], ov[k]) : ov[k]; }
    return out;
  }
  function simulateIntervention(base, overrides) {
    const baseline = runOmniRisk(base), modified = runOmniRisk(deepMerge(base, overrides));
    const p10 = (r, id) => { const p = r.predictions.find((x) => x.id === id); return p ? p.horizons.find((h) => h.years === 10).probability : 0; };
    const perDisease = baseline.predictions.map((p) => { const before = p10(baseline, p.id), after = p10(modified, p.id); return { id:p.id, name:p.name, before, after, reductionPct: before > 0 ? Math.round((before - after) / before * 1000) / 10 : 0 }; })
      .filter((d) => Math.abs(d.before - d.after) > 0.1).sort((a, b) => b.reductionPct - a.reductionPct);
    return { baseline, modified, healthIndexDelta:Math.round((modified.healthIndex - baseline.healthIndex) * 10) / 10, lifeExpectancyDelta:Math.round((modified.lifeExpectancy.lifeExpectancy - baseline.lifeExpectancy.lifeExpectancy) * 10) / 10, perDisease };
  }

  window.OmniRisk = { runOmniRisk, simulateIntervention, DISEASES, CATEGORY_LABELS };
})();
