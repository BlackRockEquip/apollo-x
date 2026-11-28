cd "C:\Projects\Apollo X Working"
# Only if push-tech-training.ps1 was already run and pushed: this commits the Cat Basics final quizzes on top.
# No migrations.
npx vitest run tests/unit/tech-training-model.test.ts tests/unit/tech-training-markdown.test.ts
git add -A
@'
Tech Training: final quizzes for the 7 Cat Basics courses

- training-seed/cat-basics/quiz/<course>.json: 25-32 questions per course written from the lesson text, with explanations;
  a final attempt draws 25. Imported with the courses, so certificates can be earned straight away.
- Courses imported before this: Course manager shows "Updates ready for imported Cat courses" to add the quiz (and any
  diagram pack now in the seed). A quiz is only added to a course with no final questions; otherwise use a new revision.
- Course settings: "Add final quiz (quiz pack .json)". API: POST manage/courses/:id/quiz, POST manage/import/cat/complete.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Uze9oWtPeuuUwXHEar7AgS
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
