import * as sqlite3 from 'sqlite3';
import { join } from 'path';

// Since this is Expo SQLite, it usually stores in a specific path. We are running in Node, so we don't have the expo app's SQLite DB directly. Wait, I can't read the SQLite db from here if it's stored on an Android device or emulator!
