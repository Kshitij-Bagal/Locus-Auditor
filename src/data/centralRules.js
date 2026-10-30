// Centrally Governed SOP Rules for the 5 DLC Refraction Inspection Stations
export const INITIAL_CENTRAL_RULES = [
  {
    id: 'selfie',
    imageKey: 'selfie',
    label: '1. Selfie: T-Shirt & ID Card',
    field: 'selfie',
    title: 'Selfie: Lenskart T-Shirt & ID Card',
    description: 'Executive wearing official Lenskart Navy Blue Polo with visible Lenskart lanyard and employee photo ID badge.',
    standards: [
      'Official Lenskart T-shirt/polo clearly visible',
      'Physical employee photo ID card clearly displayed',
      'Face clearly visible and matching employee profile'
    ],
    commonFailures: [
      'Not wearing Lenskart uniform/T-shirt',
      'Missing or unreadable ID card',
      'Face covered or blurry picture',
      'Duplicate / photo of another photo'
    ],
    triggersFatal: true,
    status: 'PUBLISHED',
    relevantEquipment: [
      { id: 'lenskart_tshirt', name: 'Official Lenskart DLC Polo T-Shirt', category: 'Merchandising, Uniform & Bags', type: 'Consumable' },
      { id: 'fe_id_card', name: 'Lanyard & Hard-Plastic Employee Photo ID Badge', category: 'Merchandising, Uniform & Bags', type: 'Consumable' }
    ]
  },
  {
    id: 'torches',
    imageKey: 'torches',
    label: '2. Working Blue & Yellow Torches',
    field: 'torches',
    title: 'Working Blue & Yellow Torches',
    description: 'Both ophthalmic penlights placed side-by-side with light beams active and tested.',
    standards: [
      'Both Blue and Yellow penlights visible',
      'Torches switched ON with light beam active',
      'Clean optical lenses without cracks'
    ],
    commonFailures: [
      'Missing blue or yellow torch',
      'Torches switched off / dead batteries',
      'Only one torch shown',
      'Picture taken inside vehicle or pouch'
    ],
    triggersFatal: true,
    status: 'PUBLISHED',
    relevantEquipment: [
      { id: 'torch_blue', name: 'Cobalt Blue Penlight Torch', category: 'Diagnostic Penlights', type: 'Asset' },
      { id: 'torch_yellow', name: 'Amber Yellow Penlight Torch', category: 'Diagnostic Penlights', type: 'Asset' },
      { id: 'torch_batteries', name: 'AAA Rechargeable Torch Batteries (Pack of 4)', category: 'Diagnostic Penlights', type: 'Consumable' }
    ]
  },
  {
    id: 'visionChart',
    imageKey: 'visionChart',
    label: '3. Vision Chart & Standee',
    field: 'visionChart',
    title: 'Vision Chart & Standee Setup',
    description: 'Standardized Snellen / LogMAR vision acuity chart properly mounted on portable telescoping standee at eye level.',
    standards: [
      'Standardized vision chart mounted on standee',
      'Positioned at correct eye level for customer',
      'Clean, crisp, unbent chart layout'
    ],
    commonFailures: [
      'Chart not mounted on standee (taped to wall)',
      'Standee missing or broken',
      'Chart crumpled, folded, or damaged',
      'Distance calibration not maintained'
    ],
    triggersFatal: true,
    status: 'PUBLISHED',
    relevantEquipment: [
      { id: 'telescopic_standee', name: 'Portable Telescopic Acuity Standee & Mounting Bracket', category: 'Vision Testing & Acuity Equipment', type: 'Asset' },
      { id: 'snellen_chart', name: 'Snellen / LogMAR Double-Sided Acuity Chart (Tear-resistant)', category: 'Vision Testing & Acuity Equipment', type: 'Consumable' }
    ]
  },
  {
    id: 'toolkit',
    imageKey: 'toolkit',
    label: '4. Complete Refraction Toolkit',
    field: 'toolkit',
    title: 'Complete Refraction Toolkit',
    description: 'Complete 6-piece clinical kit: Near vision test book, trial frame, Jackson cross cylinder (JCC), mirror, sanitizer bottle, and PD measurement tape.',
    standards: [
      'Trial Frame with clean apertures',
      'Jackson Cross Cylinder (JCC)',
      'Near Vision Book / reading card',
      'Handheld mirror',
      'Hand sanitizer bottle',
      'PD Measurement tape / ruler'
    ],
    commonFailures: [
      'Incomplete toolkit (missing trial frame or JCC)',
      'Missing hand sanitizer (hygiene violation)',
      'Missing PD ruler or near vision book',
      'Tools disorganized or in damaged condition'
    ],
    triggersFatal: true,
    status: 'PUBLISHED',
    relevantEquipment: [
      { id: 'trial_frame', name: 'Universal Clinical Trial Frame (Adult / Pediatric)', category: 'Refraction & Optical Toolkit', type: 'Asset' },
      { id: 'jcc_lens', name: 'Jackson Cross Cylinder (JCC ±0.25 / ±0.50)', category: 'Refraction & Optical Toolkit', type: 'Asset' },
      { id: 'near_vision_book', name: 'Near Vision Reading Test Book / Card', category: 'Refraction & Optical Toolkit', type: 'Consumable' },
      { id: 'hand_mirror', name: 'Handheld Patient Evaluation Mirror', category: 'Refraction & Optical Toolkit', type: 'Asset' },
      { id: 'pd_tape', name: 'Pupillary Distance (PD) Measurement Tape / Ruler', category: 'Refraction & Optical Toolkit', type: 'Consumable' },
      { id: 'hand_sanitizer', name: 'Pocket Hand Sanitizer Spray Bottle (50ml/100ml)', category: 'Hygiene & Consumables', type: 'Consumable' }
    ]
  },
  {
    id: 'frameDisplay',
    imageKey: 'frameDisplay',
    label: '5. Frame Display at Customer House',
    field: 'frameDisplay',
    title: 'Frame Display at Customer House',
    description: 'Professional multi-compartment frame showcase tray arranged neatly on customer\'s living room table with clean sample frames.',
    standards: [
      'Frame trays neatly showcased on table inside home',
      'Frames arranged cleanly in display slots',
      'Customer premises environment confirmed'
    ],
    commonFailures: [
      'Frames not unpacked / shown in carry bag only',
      'Photo clicked in hallway, elevator, or vehicle',
      'Disorganized or empty display tray',
      'Reused photo from prior visit'
    ],
    triggersFatal: true,
    status: 'PUBLISHED',
    relevantEquipment: [
      { id: 'frame_display_tray', name: 'Multi-Grid Frame Showcase Tray (18 slots)', category: 'Merchandising, Uniform & Bags', type: 'Asset' },
      { id: 'fe_carry_bag', name: 'Branded Hard-Shell DLC Equipment Carry Backpack', category: 'Merchandising, Uniform & Bags', type: 'Asset' }
    ]
  }
];
