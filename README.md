# Minimal Mistakes remote theme starter

Click [**Use this template**](https://github.com/mmistakes/mm-github-pages-starter/generate) button above for the quickest method of getting started with the [Minimal Mistakes Jekyll theme](https://github.com/mmistakes/minimal-mistakes).

Contains basic configuration to get you a site with:

- Sample posts.
- Sample top navigation.
- Sample author sidebar with social links.
- Sample footer links.
- Paginated home page.
- Archive pages for posts grouped by year, category, and tag.
- Sample about page.
- Sample 404 page.
- Site wide search.

Replace sample content with your own and [configure as necessary](https://mmistakes.github.io/minimal-mistakes/docs/configuration/).

---

## Troubleshooting

If you have a question about using Jekyll, start a discussion on the [Jekyll Forum](https://talk.jekyllrb.com/) or [StackOverflow](https://stackoverflow.com/questions/tagged/jekyll). Other resources:

- [Ruby 101](https://jekyllrb.com/docs/ruby-101/)
- [Setting up a Jekyll site with GitHub Pages](https://jekyllrb.com/docs/github-pages/)
- [Configuring GitHub Metadata](https://github.com/jekyll/github-metadata/blob/master/docs/configuration.md#configuration) to work properly when developing locally and avoid `No GitHub API authentication could be found. Some fields may be missing or have incorrect data.` warnings.

## Running Jekyll Locally on MacOS with Minimal Mistakes Theme

This guide provides instructions for setting up and running a Jekyll site with the Minimal Mistakes theme locally on macOS, including how to implement collapsible sidebar navigation.

### Prerequisites Installation

1. Install Ruby (using Homebrew is recommended):
   ```bash
   brew install ruby
   ```

2. Add Ruby to your PATH in `.zshrc` or `.bash_profile`:
   ```bash
   export PATH="/usr/local/opt/ruby/bin:$PATH"
   ```

3. Install Bundler:
   ```bash
   gem install bundler
   ```

### Set Up Your Jekyll Site

1. Create a new directory for your site (or navigate to your existing site)

2. Create or update your `Gemfile` to include Jekyll and Minimal Mistakes:
   ```ruby
   source "https://rubygems.org"
   gem "jekyll"
   gem "minimal-mistakes-jekyll"
   gem "jekyll-include-cache", group: :jekyll_plugins
   ```

3. If you're using Ruby 3.0.0+, add webrick to your dependencies:
   ```bash
   bundle add webrick
   ```

4. Create or update `_config.yml` to use the theme:
   ```yaml
   remote_theme: "mmistakes/minimal-mistakes"
   # OR
   # theme: "minimal-mistakes-jekyll"
   
   plugins:
     - jekyll-include-cache
   ```

### Install Dependencies and Run

1. Install all dependencies:
   ```bash
   bundle install
   ```

2. Run the local server:
   ```bash
   bundle exec jekyll serve
   ```

3. View your site at `http://localhost:4000`

4. Use the `--watch` flag to automatically regenerate the site when files change:
   ```bash
   bundle exec jekyll serve --watch
   ```

Remember that if you make changes to `_config.yml`, you'll need to restart the Jekyll server for those changes to take effect.
