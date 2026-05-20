#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function execCommand(command, silent = false) {
  try {
    return execSync(command, { encoding: 'utf-8', stdio: silent ? 'pipe' : 'inherit' });
  } catch (error) {
    if (!silent) {
      log(`Command failed: ${command}`, 'red');
    }
    throw error;
  }
}

function getCurrentVersion() {
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
  return packageJson.version;
}

function updateVersion(newVersion) {
  const packageJsonPath = path.join(process.cwd(), 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
  const oldVersion = packageJson.version;

  packageJson.version = newVersion;

  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');

  log(`\n✓ Version updated: ${oldVersion} → ${newVersion}`, 'green');
  return oldVersion;
}

function validateVersion(version) {
  // Support semver with optional prerelease: 1.0.0, 1.0.0-alpha, 1.0.0-beta.1
  const semverRegex = /^(\d+)\.(\d+)\.(\d+)(?:-([a-zA-Z0-9.-]+))?$/;
  return semverRegex.test(version);
}

function suggestNextVersions(currentVersion) {
  const match = currentVersion.match(/^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/);
  if (!match) return [];

  const [, major, minor, patch, prerelease] = match;
  const suggestions = [];

  // If current is prerelease, suggest release version
  if (prerelease) {
    suggestions.push({ version: `${major}.${minor}.${patch}`, desc: 'Release (remove prerelease)' });
  }

  // Patch bump
  suggestions.push({ version: `${major}.${minor}.${parseInt(patch) + 1}`, desc: 'Patch bump' });

  // Minor bump
  suggestions.push({ version: `${major}.${parseInt(minor) + 1}.0`, desc: 'Minor bump' });

  // Major bump
  suggestions.push({ version: `${parseInt(major) + 1}.0.0`, desc: 'Major bump' });

  // Prerelease versions
  suggestions.push({ version: `${major}.${minor}.${parseInt(patch) + 1}-alpha`, desc: 'Alpha prerelease' });
  suggestions.push({ version: `${major}.${minor}.${parseInt(patch) + 1}-beta`, desc: 'Beta prerelease' });

  return suggestions;
}

function printHelp() {
  console.log(`
${colors.bright}Oasis GTD Release Script${colors.reset}

Usage:
  node scripts/release.js [options] [version]

Options:
  --help, -h          Show this help message
  --skip-build        Skip the build step
  --skip-git          Skip git commit and tag
  --temp              Build a temporary test package without version bump or git
  --dry-run           Show what would happen without making changes

Examples:
  node scripts/release.js 1.0.0
  node scripts/release.js 1.0.0-beta.1
  node scripts/release.js --dry-run 1.0.0
  node scripts/release.js --skip-build 1.0.0
`);
}

async function promptVersion(currentVersion) {
  const suggestions = suggestNextVersions(currentVersion);

  log('\nCurrent version: ', 'yellow');
  log(`  ${currentVersion}\n`);

  log('Suggested versions:', 'blue');
  suggestions.forEach((s, i) => {
    log(`  ${i + 1}. ${s.version.padEnd(15)} (${s.desc})`);
  });
  log(`  0. Enter custom version\n`);

  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question('Select option (0-6) or enter version: ', (answer) => {
      rl.close();

      const num = parseInt(answer);
      if (num >= 1 && num <= suggestions.length) {
        resolve(suggestions[num - 1].version);
      } else if (num === 0 || isNaN(num)) {
        if (validateVersion(answer)) {
          resolve(answer);
        } else {
          log(`Invalid version format: ${answer}`, 'red');
          log('Expected format: X.Y.Z or X.Y.Z-prerelease', 'yellow');
          resolve(null);
        }
      } else {
        resolve(null);
      }
    });
  });
}

async function main() {
  const args = process.argv.slice(2);

  // Parse options
  const options = {
    help: args.includes('--help') || args.includes('-h'),
    skipBuild: args.includes('--skip-build'),
    skipGit: args.includes('--skip-git'),
    temp: args.includes('--temp'),
    dryRun: args.includes('--dry-run'),
  };

  const currentVersion = getCurrentVersion();

  if (options.help) {
    printHelp();
    process.exit(0);
  }

  // Temp mode: build without version bump or git
  if (options.temp) {
    const d = new Date();
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    const s = String(d.getSeconds()).padStart(2, '0');
    const timestamp = `${y}${mo}${dd}T${h}${mi}${s}`;
    const tempVersion = `${currentVersion}-temp-${timestamp}`;

    log(`\n${colors.bright}╔══════════════════════════════════════╗${colors.reset}`);
    log(`${colors.bright}║      Temp Build (no version bump)    ║${colors.reset}`);
    log(`${colors.bright}╚══════════════════════════════════════╝${colors.reset}\n`);
    log(`  Version:       ${currentVersion}`);
    log(`  Build version: ${tempVersion}`);
    log(`  Git commit:    skipped\n`);

    log('\n[1/2] Building...', 'blue');
    try {
      const platform = process.platform;
      let buildCmd = 'npm run build:win';
      if (platform === 'darwin') buildCmd = 'npm run build:mac';
      else if (platform !== 'win32') buildCmd = 'npm run build:linux';

      if (options.skipBuild) {
        log('(skipped)', 'yellow');
      } else {
        execCommand(buildCmd);
        log('✓ Build complete!', 'green');
      }
    } catch (error) {
      log('Build failed!', 'red');
      process.exit(1);
    }

    log('\n[2/2] Temp build complete!', 'green');
    log('  No files were modified or committed.', 'yellow');
    console.log();
    process.exit(0);
  }


  // Get version from args or prompt
  let newVersion = args.find(arg => !arg.startsWith('--'));

  log(`\n${colors.bright}╔══════════════════════════════════════╗${colors.reset}`);
  log(`${colors.bright}║     Oasis GTD Release Builder        ║${colors.reset}`);
  log(`${colors.bright}╚══════════════════════════════════════╝${colors.reset}\n`);

  if (!newVersion) {
    newVersion = await promptVersion(currentVersion);
    if (!newVersion) {
      process.exit(1);
    }
  } else if (!validateVersion(newVersion)) {
    log(`Invalid version format: ${newVersion}`, 'red');
    log('Expected format: X.Y.Z or X.Y.Z-prerelease', 'yellow');
    process.exit(1);
  }

  log(`\n${colors.bright}Release Plan:${colors.reset}`);
  log(`  Current version: ${currentVersion}`);
  log(`  New version:     ${newVersion}`);
  log(`  Build:           ${options.skipBuild ? 'skipped' : 'yes'}`);
  log(`  Git commit:      ${options.skipGit ? 'skipped' : 'yes'}`);
  log(`  Dry run:         ${options.dryRun ? 'yes' : 'no'}\n`);

  if (options.dryRun) {
    log('Dry run complete. No changes made.', 'green');
    process.exit(0);
  }

  // Update version
  log('\n[1/4] Updating version...', 'blue');
  updateVersion(newVersion);

  // Git operations
  if (!options.skipGit) {
    log('\n[2/4] Creating git commit and tag...', 'blue');
    try {
      execCommand(`git add package.json`);
      execCommand(`git commit -m "chore: release v${newVersion}"`);
      execCommand(`git tag -a v${newVersion} -m "Release v${newVersion}"`);
      log(`✓ Created commit and tag v${newVersion}`, 'green');
    } catch (error) {
      log('Warning: Git operations failed. Continuing...', 'yellow');
    }
  } else {
    log('\n[2/4] Skipping git operations', 'yellow');
  }

  // Build
  if (!options.skipBuild) {
    log('\n[3/4] Building release...', 'blue');
    try {
      // Detect platform
      const platform = process.platform;
      let buildCmd = 'npm run build:win';

      if (platform === 'darwin') {
        buildCmd = 'npm run build:mac';
      } else if (platform !== 'win32') {
        buildCmd = 'npm run build:linux';
      }

      execCommand(buildCmd);
      log('✓ Build complete!', 'green');
    } catch (error) {
      log('Build failed!', 'red');
      process.exit(1);
    }
  } else {
    log('\n[3/4] Skipping build', 'yellow');
  }

  // Done
  log('\n[4/4] Release complete!', 'green');
  log(`\n${colors.bright}╔══════════════════════════════════════╗${colors.reset}`);
  log(`${colors.bright}║          Release Summary             ║${colors.reset}`);
  log(`${colors.bright}╚══════════════════════════════════════╝${colors.reset}`);
  log(`  Version:    v${newVersion}`);
  log(`  Build file: dist/Oasis-GTD-Setup-${newVersion}.exe`);
  if (!options.skipGit) {
    log(`  Git tag:    v${newVersion}`);
    log(`\n  Push with:  git push && git push --tags`);
  }
  console.log();
}

main().catch((error) => {
  log(`\nError: ${error.message}`, 'red');
  process.exit(1);
});