SHARED_FILES := background.js content-script.js options.css options.html options.js
ALL_FILES := $(SHARED_FILES) manifest.json
ALL_PATHS := $(foreach dir,chrome firefox,$(foreach file,$(ALL_FILES),$(dir)/$(file)))
EXTRA_PATHS := $(filter-out $(ALL_PATHS),$(wildcard chrome/* firefox/*))

.PHONY: build
build:
	@mkdir -p chrome firefox
	@cp $(SHARED_FILES) chrome/
	@cp $(SHARED_FILES) firefox/
	@cp manifest-chrome.json chrome/manifest.json
	@cp manifest-firefox.json firefox/manifest.json
	@rm -rf $(EXTRA_PATHS)
	@echo updated: $(PWD)/{chrome,firefox}

.PHONY: watch
watch:
	watchexec -- make -s build
