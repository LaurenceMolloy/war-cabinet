import sys

path = r"c:\Users\Laurence Molloy\Desktop\GIT\Personal_Github\war-cabinet\mobile\src\app\recipes.tsx"
with open(path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

def fix_sort_block(lines, start_line_hint):
    # Find the sort block starting near start_line_hint
    for i in range(start_line_hint, len(lines)):
        if '.sort((a, b) => {' in lines[i]:
            sort_start = i
            # Find the end of this sort block
            for j in range(i, len(lines)):
                if '})' in lines[j] and '.slice(0, 3)' in lines[j+1]:
                    sort_end = j
                    # Replace the content inside the sort block
                    new_sort_content = [
                        '                            .sort((a, b) => {\n',
                        '                               const aFreq = usageStats[a] || 0;\n',
                        '                               const bFreq = usageStats[b] || 0;\n',
                        '                               if (aFreq !== bFreq) return bFreq - aFreq;\n',
                        '\n',
                        '                               const aStarts = a.toLowerCase().startsWith(query);\n',
                        '                               const bStarts = b.toLowerCase().startsWith(query);\n',
                        '                               if (aStarts && !bStarts) return -1;\n',
                        '                               if (!aStarts && bStarts) return 1;\n',
                        '\n',
                        '                               const aCustom = customIngredients.includes(a);\n',
                        '                               const bCustom = customIngredients.includes(b);\n',
                        '                               if (aCustom && !bCustom) return -1;\n',
                        '                               if (!aCustom && bCustom) return 1;\n',
                        '                               \n',
                        '                               return a.length - b.length || a.localeCompare(b);\n',
                        '                            })\n'
                    ]
                    return lines[:sort_start] + new_sort_content + lines[sort_end+1:]
    return lines

# First pass for Add-ons (around 1170)
lines = fix_sort_block(lines, 1100)
# Second pass for Staples (around 1300)
lines = fix_sort_block(lines, 1250)

with open(path, 'w', encoding='utf-8') as f:
    f.writelines(lines)
