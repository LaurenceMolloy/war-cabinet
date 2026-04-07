const fs = require('fs');

try {
  const data = JSON.parse(fs.readFileSync('test_results.json', 'utf8'));
  const error = data.errors[0];
  if (error) {
    console.log(error.message);
  } else {
    // If no top-level errors, look into the suites
    let found = false;
    for (const suite of data.suites) {
      for (const spec of suite.specs) {
        if (!spec.ok) {
          for (const test of spec.tests) {
            for (const result of test.results) {
              for (const err of result.errors) {
                console.log(err.message);
                found = true;
                break;
              }
              if (found) break;
            }
            if (found) break;
          }
        }
        if (found) break;
      }
      if (found) break;
    }
  }
} catch (e) {
  console.log("Error reading JSON:", e);
}
