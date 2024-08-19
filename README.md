Tag completion
==============

This plugin uses the `&tags` setting to provide insert and command-mode
popup completion with tag file entries (requires [denops.vim](https://github.com/vim-denops/denops.vim) and [ddc.vim](https://github.com/Shougo/ddc.vim)).

To configure add the following to your `~/.vimrc`:

```vim
call ddc#custom#patch_global('sources', ['tags'])
call ddc#custom#patch_global('sourceParams', {'tags': {'maxSize': 100, ...}})
```

Installation
============

Install with your favorite [plugin manager](https://vi.stackexchange.com/q/388/8084).
I highly recommend the [vim-plug](https://github.com/junegunn/vim-plug) manager.
To install with vim-plug, add

```
Plug 'lukelbd/ddc-source-tags'
```
to your `~/.vimrc`.
