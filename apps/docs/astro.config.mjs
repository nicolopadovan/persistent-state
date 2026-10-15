// @ts-check
import starlight from '@astrojs/starlight'
import { defineConfig } from 'astro/config'
import starlightLlmsTxt from 'starlight-llms-txt'

export default defineConfig({
  site: 'https://persistent-state.nicolopadovan.com',
  integrations: [
    starlight({
      title: 'persistent-state',
      disable404Route: true,
      description:
        'Persistent React state in a cookie, localStorage or sessionStorage, readable on the server for cookies.',
      plugins: [starlightLlmsTxt({ rawContent: true, exclude: ['help/changelog'] })],
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/nicolopadovan/persistent-state' }],
      editLink: { baseUrl: 'https://github.com/nicolopadovan/persistent-state/edit/main/apps/docs/' },
      customCss: ['./src/styles/custom.css'],
      routeMiddleware: './src/routeData.ts',
      sidebar: [
        {
          label: 'Getting started',
          items: [{ label: 'Introduction', link: '/' }, { autogenerate: { directory: 'start' } }],
        },
        { label: 'Guides', items: [{ autogenerate: { directory: 'guides' } }] },
        { label: 'API reference', items: [{ autogenerate: { directory: 'reference' } }] },
        { label: 'How it works', items: [{ autogenerate: { directory: 'internals' } }] },
        { label: 'Help', items: [{ autogenerate: { directory: 'help' } }] },
      ],
    }),
  ],
})
