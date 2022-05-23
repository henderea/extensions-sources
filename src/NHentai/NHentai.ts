import {
    Source,
    Manga,
    Chapter,
    ChapterDetails,
    HomeSection,
    SearchRequest,
    PagedResults,
    SourceInfo,
    TagType,
    Request,
    Response,
    RequestManager,
    ContentRating,
    Section,
    SourceStateManager
} from 'paperback-extensions-common'
import { NHSortOrders } from './NHentaiHelper'
import {
    parseChapterDetails,
    parseGallery,
    parseGalleryIntoChapter,
    parseSearch
} from './NHentaiParser'
import {
    getExtraArgs,
    resetSettings,
    settings
} from './NHentaiSettings'


const NHENTAI_URL = 'https://nhentai.net'
const API = NHENTAI_URL + '/api'
const method = 'GET'

export const NHentaiInfo: SourceInfo = {
    version: '3.2.3.2',
    name: 'nhentai',
    description: 'Extension which pulls 18+ content from nHentai. (Literally all of it. We know why you\'re here)',
    author: 'NotMarek',
    authorWebsite: 'https://github.com/notmarek',
    icon: 'icon.png',
    contentRating: ContentRating.ADULT,
    sourceTags: [{ text: '18+', type: TagType.YELLOW }, { text: 'Cloudflare', type: TagType.RED }],
    websiteBaseURL: NHENTAI_URL,
}

const language = async (stateManager: SourceStateManager): Promise<string> => {
    const lang = (await stateManager.retrieve('languages') as string) ?? ''
    if (lang.length === 0) {
        return '""'
    }
    else {
        return `language:${lang}`
    }
}

const sortOrder = async (query: string, stateManager: SourceStateManager): Promise<string[]> => {
    const inQuery: string[] = NHSortOrders.containsShortcut(query)
    if (inQuery[0]?.length !== 0) {
        return [inQuery[0] ?? '', query.replace(inQuery[1] ?? '', '')]
    } else {
        const sortOrder = (await stateManager.retrieve('sort_order') as string) ?? NHSortOrders.getDefault()
        return [sortOrder, query]    
    }
}

const extraArgs = async (stateManager: SourceStateManager): Promise<string> => {
    const args = await getExtraArgs(stateManager)
    return ` ${args}` 
}

const userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.4 Mobile/15E148 Safari/604.1'

export class NHentai extends Source {
    readonly requestManager: RequestManager = createRequestManager({
        requestsPerSecond: 3,
        requestTimeout: 15000,
        interceptor: {
            interceptRequest: async (request: Request): Promise<Request> => {

                request.headers = {
                    ...(request.headers ?? {}),
                    ...{
                        ...({ 'user-agent': userAgent }),
                        'referer': `${NHENTAI_URL}/`
                    }
                }

                return request
            },

            interceptResponse: async (response: Response): Promise<Response> => {
                return response
            }
        }
    });

    stateManager = createSourceStateManager({})

    override getMangaShareUrl(mangaId: string): string {
        return `${NHENTAI_URL}/g/${mangaId}`
    }

    override async getSourceMenu(): Promise<Section> {
        return Promise.resolve(createSection({
            id: 'main',
            header: 'Source Settings',
            rows: () => Promise.resolve([
                settings(this.stateManager),
                resetSettings(this.stateManager),
            ])
        }))
    }
    async getMangaDetails(mangaId: string): Promise<Manga> {
        const request = createRequestObject({
            url: `${API}/gallery/${mangaId}`,
            method,
        })
        const data = await this.requestManager.schedule(request, 1)
        this.CloudFlareError(data.status)
        const json_data = (typeof data.data == 'string') ? JSON.parse(data.data) : data.data
        return parseGallery(json_data)
    }

    async getChapters(mangaId: string): Promise<Chapter[]> {
        const request = createRequestObject({
            url: `${API}/gallery/${mangaId}`,
            method,
        })
        const data = await this.requestManager.schedule(request, 1)
        this.CloudFlareError(data.status)
        const json_data = (typeof data.data == 'string') ? JSON.parse(data.data) : data.data
        return [parseGalleryIntoChapter(json_data, mangaId)]
    }

    async getChapterDetails(mangaId: string): Promise<ChapterDetails> {
        const request = createRequestObject({
            url: `${API}/gallery/${mangaId}`,
            method
        })
        const data = await this.requestManager.schedule(request, 1)
        this.CloudFlareError(data.status)
        const json_data = (typeof data.data == 'string') ? JSON.parse(data.data) : data.data
        return parseChapterDetails(json_data, mangaId)

    }

    override async getSearchResults(query: SearchRequest, metadata: { page: number, stopSearch: boolean } | null | undefined): Promise<PagedResults> {
        const page: number = metadata?.page ?? 1
        const title: string = query.title ?? ''
        if (metadata?.stopSearch ?? false){
            return createPagedResults({
                results: [],
                metadata: {
                    stopSearch: true
                }
            })
        }
        if (/^\d+$/.test(title)) {
            const request = createRequestObject({
                url: `${API}/gallery/${title}`,
                method
            })
            const data = await this.requestManager.schedule(request, 1)
            this.CloudFlareError(data.status)
            const json_data = (typeof data.data == 'string') ? JSON.parse(data.data) : data.data
            return createPagedResults({
                results: parseSearch({ result: [json_data],  num_pages: 1, per_page: 1}),
                metadata: {
                    page: page + 1,
                    stopSearch: true
                }
            })
        } else {
            const q: string = title + ' ' + await language(this.stateManager) + await extraArgs(this.stateManager)
            const [sort, query]: string[] = await sortOrder(q, this.stateManager) ?? ['', q]
            const request = createRequestObject({
                url: `${API}/galleries/search?query=${encodeURIComponent(query ?? '')}&sort=${sort}&page=${page}`,
                method
            })
            const data = await this.requestManager.schedule(request, 1)
            this.CloudFlareError(data.status)
            const json_data = (typeof data.data == 'string') ? JSON.parse(data.data) : data.data
            return createPagedResults({
                results: parseSearch(json_data),
                metadata: {
                    page: page + 1
                }
            })
        }

    }

    override async getHomePageSections(sectionCallback: (section: HomeSection) => void): Promise<void> {
        const section1 = createHomeSection({ id: 'date', title: 'Recent', view_more: true })
        const section2 = createHomeSection({ id: 'popular-today', title: 'Popular Today', view_more: true })
        const section3 = createHomeSection({ id: 'popular-week', title: 'Popular Week', view_more: true })
        const section4 = createHomeSection({ id: 'popular', title: 'Popular All-time', view_more: true })
        const sections = [section1, section2, section3, section4]

        for (const section of sections) {
            sectionCallback(section)
            const request = createRequestObject({
                url: `${API}/galleries/search?query=${encodeURIComponent(await language(this.stateManager) + await extraArgs(this.stateManager))}&sort=${section.id}`,
                method
            })
            const data = await this.requestManager.schedule(request, 1)
            this.CloudFlareError(data.status)
            const json_data = (typeof data.data == 'string') ? JSON.parse(data.data) : data.data
            section.items = parseSearch(json_data)
            sectionCallback(section)
        }
    }

    override async getViewMoreItems(homepageSectionId: string, metadata: {page: number} | null | undefined): Promise<PagedResults> {
        let page: number = metadata?.page ?? 1
        const request = createRequestObject({
            url: `${API}/galleries/search?query=${encodeURIComponent(await language(this.stateManager) + await extraArgs(this.stateManager))}&sort=${homepageSectionId}&page=${page}`,
            method
        })
        const data = await this.requestManager.schedule(request, 1)
        this.CloudFlareError(data.status)
        const json_data = (typeof data.data == 'string') ? JSON.parse(data.data) : data.data
        page++
        return createPagedResults({
            results: parseSearch(json_data),
            metadata: {
                page: page
            }
        })
    }
    override getCloudflareBypassRequest(): Request {
        return createRequestObject({
            url: NHENTAI_URL,
            method: 'GET',
            headers: {
                'user-agent': userAgent,
                'referer': `${NHENTAI_URL}.`
            }
        })
    }

    CloudFlareError(status: number): void {
        if (status == 503) {
            throw new Error('CLOUDFLARE BYPASS ERROR:\nPlease go to Settings > Sources > <The name of this source> and press Cloudflare Bypass')
        }
    }
}
