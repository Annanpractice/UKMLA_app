from pathlib import Path

path=Path('.github/workflows/pages.yml')
text=path.read_text(encoding='utf-8')

def replace_once(old,new):
    global text
    if old not in text:
        raise SystemExit(f'Missing pages workflow target: {old[:120]!r}')
    text=text.replace(old,new,1)

replace_once(
"""            v2/ai-engine.js \\
            v2/ai-ui.js \\
            v2/biomedical.js \\
""",
"""            v2/ai-engine.js \\
            v2/ai-ui.js \\
            v2/ai-save-recovery.js \\
            v2/biomedical.js \\
"""
)
replace_once(
"""            scripts/validate_combined_pipeline.js \\
            scripts/validate_question_bank.js \\
            scripts/validate_checkpoint_auto_repair.js
""",
"""            scripts/validate_combined_pipeline.js \\
            scripts/validate_question_bank.js \\
            scripts/validate_generated_set_survival.js \\
            scripts/validate_checkpoint_auto_repair.js
"""
)
replace_once(
"""      - name: Validate IndexedDB Question Bank, quota rollback and analytics
        run: node scripts/validate_question_bank.js

      - name: Validate biomedical sources, question integration and generated data
""",
"""      - name: Validate IndexedDB Question Bank, quota rollback and analytics
        run: node scripts/validate_question_bank.js

      - name: Validate generated sets survive quota and interrupted indexing
        run: node scripts/validate_generated_set_survival.js

      - name: Validate biomedical sources, question integration and generated data
"""
)
replace_once(
"""          grep -q "assertRequiredApiCheckpoints" v2/ai-engine.js
          grep -q "apiSuccessByStage" v2/ai-engine.js
""",
"""          grep -q "assertRequiredApiCheckpoints" v2/ai-engine.js
          grep -q "apiSuccessByStage" v2/ai-engine.js
          grep -q "PENDING_SET_PREFIX" v2/ai-engine.js
          grep -q "recoverableSets" v2/ai-save-recovery.js
          grep -q "reconcileIndex" v2/question-bank.js
"""
)
replace_once("assert 'question-bank.js?v=2' in html","assert 'question-bank.js?v=3' in html")
replace_once("assert 'ai-engine.js?v=8' in html","assert 'ai-engine.js?v=10' in html")
replace_once(
"""          assert 'ai-ui.js?v=4' in html
          assert 'sync.js?v=4' in html
""",
"""          assert 'ai-ui.js?v=4' in html
          assert 'ai-save-recovery.js?v=2' in html
          assert 'sync.js?v=4' in html
"""
)
replace_once(
"""          test -s _site/v2/ai-engine.js
          test -s _site/v2/ai-ui.js
          test -s _site/v2/biomedical.js
""",
"""          test -s _site/v2/ai-engine.js
          test -s _site/v2/ai-ui.js
          test -s _site/v2/ai-save-recovery.js
          test -s _site/v2/biomedical.js
"""
)
replace_once("grep -q 'question-bank.js?v=2' _site/index.html","grep -q 'question-bank.js?v=3' _site/index.html")
replace_once("grep -q 'ai-engine.js?v=8' _site/index.html","grep -q 'ai-engine.js?v=10' _site/index.html")
replace_once(
"""          grep -q 'ai-ui.js?v=4' _site/index.html
          grep -q 'biomedical.js' _site/index.html
""",
"""          grep -q 'ai-ui.js?v=4' _site/index.html
          grep -q 'ai-save-recovery.js?v=2' _site/index.html
          grep -q 'biomedical.js' _site/index.html
"""
)
replace_once("grep -q 'ukmla-cards-v11-sba-runtime-proof' _site/service-worker.js","grep -q 'ukmla-cards-v14-generated-set-survival' _site/service-worker.js")
replace_once(
"""          grep -q 'ai-targeted-repair.js' _site/service-worker.js
          python - <<'PY'
""",
"""          grep -q 'ai-targeted-repair.js' _site/service-worker.js
          grep -q 'ai-save-recovery.js' _site/service-worker.js
          python - <<'PY'
"""
)
path.write_text(text,encoding='utf-8')
print('Updated Pages validation for generated-set survival release')
