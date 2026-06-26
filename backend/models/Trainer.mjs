// Re-export the single canonical Trainer model defined in Trainer.js (CommonJS).
//
// Previously this file declared a SEPARATE, minimal Mongoose schema and
// registered it as the 'Trainer' model. Because both this file and Trainer.js
// call mongoose.model('Trainer', ...), whichever loaded first won — and when
// this minimal schema won, fields like `colleges`, `trainerId`, and Drive ids
// were missing, causing admin college assignments and Drive folder metadata to
// be stripped on save. Re-exporting the rich model keeps one source of truth.
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Trainer = require('./Trainer.js');

export default Trainer;
