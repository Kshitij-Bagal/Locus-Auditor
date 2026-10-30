// Catalogue of all clinical assets, diagnostic equipment, and consumables used by Lenskart Home Eye Test Field Executives
export const EQUIPMENT_CATALOGUE = [
  {
    category: 'Diagnostic Penlights',
    items: [
      { id: 'torch_blue', name: 'Cobalt Blue Penlight Torch', type: 'Asset', defaultCost: 450 },
      { id: 'torch_yellow', name: 'Amber Yellow Penlight Torch', type: 'Asset', defaultCost: 350 },
      { id: 'torch_batteries', name: 'AAA Rechargeable Torch Batteries (Pack of 4)', type: 'Consumable', defaultCost: 200 }
    ]
  },
  {
    category: 'Refraction & Optical Toolkit',
    items: [
      { id: 'trial_frame', name: 'Universal Clinical Trial Frame (Adult / Pediatric)', type: 'Asset', defaultCost: 1800 },
      { id: 'jcc_lens', name: 'Jackson Cross Cylinder (JCC ±0.25 / ±0.50)', type: 'Asset', defaultCost: 850 },
      { id: 'near_vision_book', name: 'Near Vision Reading Test Book / Card', type: 'Consumable', defaultCost: 350 },
      { id: 'hand_mirror', name: 'Handheld Patient Evaluation Mirror', type: 'Asset', defaultCost: 250 },
      { id: 'pd_tape', name: 'Pupillary Distance (PD) Measurement Tape / Ruler', type: 'Consumable', defaultCost: 120 },
      { id: 'occluder', name: 'Handheld Eye Occluder / Pinhole Disc', type: 'Asset', defaultCost: 180 }
    ]
  },
  {
    category: 'Vision Testing & Acuity Equipment',
    items: [
      { id: 'telescopic_standee', name: 'Portable Telescopic Acuity Standee & Mounting Bracket', type: 'Asset', defaultCost: 2400 },
      { id: 'snellen_chart', name: 'Snellen / LogMAR Double-Sided Acuity Chart (Tear-resistant)', type: 'Consumable', defaultCost: 400 }
    ]
  },
  {
    category: 'Hygiene & Consumables',
    items: [
      { id: 'hand_sanitizer', name: 'Pocket Hand Sanitizer Spray Bottle (50ml/100ml)', type: 'Consumable', defaultCost: 90 },
      { id: 'lens_cleaning_spray', name: 'Anti-Static Lens Cleaning Spray & Microfiber Cloths', type: 'Consumable', defaultCost: 150 },
      { id: 'sanitizing_wipes', name: 'Alcohol Disinfection Instrument Wipes (Pack of 50)', type: 'Consumable', defaultCost: 180 }
    ]
  },
  {
    category: 'Merchandising, Uniform & Bags',
    items: [
      { id: 'frame_display_tray', name: 'Multi-Grid Frame Showcase Tray (18 slots)', type: 'Asset', defaultCost: 950 },
      { id: 'fe_carry_bag', name: 'Branded Hard-Shell DLC Equipment Carry Backpack', type: 'Asset', defaultCost: 2100 },
      { id: 'lenskart_tshirt', name: 'Official Lenskart DLC Polo T-Shirt', type: 'Consumable', defaultCost: 550 },
      { id: 'fe_id_card', name: 'Lanyard & Hard-Plastic Employee Photo ID Badge', type: 'Consumable', defaultCost: 150 }
    ]
  }
];

export const FAULT_CONDITIONS = [
  'Non-working / Inoperative',
  'Damaged / Broken parts',
  'Missing from kit / Lost',
  'Exhausted / Depleted consumable',
  'Worn out / Unhygienic condition',
  'Calibration / Accuracy issue'
];

export const REPLACEMENT_URGENCY = [
  { value: 'IMMEDIATE', label: 'Critical / Immediate Block (Within 24h)', color: 'text-red-400 bg-red-950/40 border-red-500/50' },
  { value: 'HIGH', label: 'High Priority (Next Batch Order)', color: 'text-amber-400 bg-amber-950/40 border-amber-500/50' },
  { value: 'NORMAL', label: 'Routine Consumable Restock', color: 'text-sky-400 bg-sky-950/40 border-sky-500/50' }
];
