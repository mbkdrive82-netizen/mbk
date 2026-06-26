// Re-export the single canonical College model defined in College.js (CommonJS).
//
// Previously this file declared a SEPARATE, minimal Mongoose schema and
// registered it as the 'College' model. Because both this file and College.js
// call mongoose.model('College', ...), whichever loaded first won — and when
// this minimal schema won, it lacked the `trainers`/`companyId`/`location`
// paths, causing `GET /api/colleges` to 500 with a StrictPopulateError and
// stripping rich fields from query results. Re-exporting the rich model keeps a
// single source of truth so every subsystem shares the same schema.
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const College = require('./College.js');

export default College;
