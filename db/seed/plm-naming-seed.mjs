const BASE = 'http://localhost:3005/api/v1';

const entries = [
  { concept: '零件編號', std_name: 'part_no', aliases: ['part_number','pn','item_no','item_number','material_no'], domain: 'PLM', description: '零件的唯一識別碼，用於跨系統查詢與 BOM 展開' },
  { concept: '零件名稱', std_name: 'part_name', aliases: ['part_desc','item_name','description','item_desc'], domain: 'PLM', description: '零件的中文或英文顯示名稱，供人員識別' },
  { concept: '版次', std_name: 'revision_no', aliases: ['rev','revision','rev_no','version_no'], domain: 'PLM', description: '零件或文件的工程版次，通常為字母序 A/B/C 或數字' },
  { concept: '生命週期狀態', std_name: 'lifecycle_state', aliases: ['status','state','part_status','lifecycle'], domain: 'PLM', description: '零件在產品生命週期中的狀態：Draft/Released/Obsolete 等' },
  { concept: 'ECO 編號', std_name: 'eco_no', aliases: ['eco','change_no','ecn_no','ecr_no'], domain: 'PLM', description: '工程變更單的唯一編號，串接 ECO 表頭與影響零件明細' },
  { concept: '有效起始日', std_name: 'effectivity_start', aliases: ['eff_start','start_date','valid_from','eff_from'], domain: 'PLM', description: 'BOM 或零件版次的生效起始日期，用於時效性查詢' },
  { concept: '有效終止日', std_name: 'effectivity_end', aliases: ['eff_end','end_date','valid_to','eff_to'], domain: 'PLM', description: 'BOM 或零件版次的失效日期，NULL 代表永久有效' },
  { concept: '用量', std_name: 'qty', aliases: ['quantity','amount','qty_per','usage_qty'], domain: 'PLM', description: 'BOM 明細中子料件相對於父件的每台用量' },
  { concept: '參考位號', std_name: 'ref_designator', aliases: ['ref_des','designator','ref','refdes'], domain: 'PLM', description: 'PCB 佈局上元件的標記代號，例如 C1, R2, U5' },
  { concept: '核准供應商', std_name: 'approved_vendor', aliases: ['vendor','supplier','approved_mfr','aml'], domain: 'PLM', description: 'AVL 核准製造商或供應商名稱' },
  { concept: '製程節點', std_name: 'process_node', aliases: ['tech_node','process','geometry','node'], domain: '半導體', description: '積體電路製程技術節點，例如 28nm, 7nm, 3nm' },
  { concept: '封裝類型', std_name: 'package_type', aliases: ['pkg','package','pkg_type','package_code'], domain: '半導體', description: 'IC 封裝形式，例如 QFP, BGA, CSP, DIP' },
  { concept: '腳位數', std_name: 'pin_count', aliases: ['pins','pin_no','io_count','pad_count'], domain: '半導體', description: 'IC 封裝的接腳總數，影響 PCB 佈線複雜度' },
  { concept: '晶片版次', std_name: 'die_revision', aliases: ['die_rev','silicon_rev','chip_rev','mask_rev'], domain: '半導體', description: '矽晶片的遮罩版次，不同版次代表不同的矽修正' },
  { concept: '計量單位', std_name: 'unit_of_measure', aliases: ['uom','unit','measure_unit','qty_unit'], domain: 'PLM', description: '零件庫存計量單位：EA（個）、M（公尺）、KG（公斤）等' },
  { concept: '前置時間', std_name: 'lead_time_days', aliases: ['lead_time','lt_days','lt','procurement_lt'], domain: 'PLM', description: '採購前置天數，從下單到收料的標準天數' },
  { concept: '最小訂購量', std_name: 'min_order_qty', aliases: ['moq','min_qty','minimum_order','min_order'], domain: 'PLM', description: '供應商要求的最小一次訂購數量' },
  { concept: '排序順序', std_name: 'sort_order', aliases: ['order','seq','sequence','display_order','rank'], domain: '通用', description: '記錄的顯示排序值，數值越小越靠前' },
  { concept: '父層 ID', std_name: 'parent_id', aliases: ['parent','parent_key','superior_id','up_id'], domain: '通用', description: '樹狀結構中父節點的 ID，NULL 代表根節點' },
  { concept: 'UNSPSC 代碼', std_name: 'unspsc_code', aliases: ['unspsc','commodity_code','product_code'], domain: 'PLM', description: 'UN 標準採購分類代碼（8碼），用於跨企業採購分類對應' },
];

for (const e of entries) {
  const r = await fetch(BASE + '/naming-dictionary', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(e),
  });
  const j = await r.json();
  if (r.ok) console.log('✓', e.std_name);
  else console.error('✗', e.std_name, JSON.stringify(j));
}
console.log('done');
