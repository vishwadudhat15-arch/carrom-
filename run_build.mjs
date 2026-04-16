import { exec } from 'child_process';
import fs from 'fs';

exec('npm run build', { cwd: 'd:/carrom' }, (err, stdout, stderr) => {
  fs.writeFileSync('d:/carrom/build_out.txt', `STDOUT:\n${stdout}\n\nSTDERR:\n${stderr}\n\nERR:\n${err}`);
});
