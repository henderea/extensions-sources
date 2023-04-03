import { DUIButton,
    DUIFormRow,
    DUINavigationButton,
    RequestManager,
    SourceStateManager } from '@paperback/types'
import { MDLanguages,
    MDRatings,
    MDImageQuality,
    MDHomepageSections } from './MangaDexHelper'
import { sliceRecommendedIds,
//getRecommendedIds
} from './MangaDexSimilarManga'
export const getLanguages = async (stateManager: SourceStateManager): Promise<string[]> => {
    return (await stateManager.retrieve('languages') as string[]) ?? MDLanguages.getDefault()
}
export const getRatings = async (stateManager: SourceStateManager): Promise<string[]> => {
    return (await stateManager.retrieve('ratings') as string[]) ?? MDRatings.getDefault()
}
export const getDataSaver = async (stateManager: SourceStateManager): Promise<boolean> => {
    return (await stateManager.retrieve('data_saver') as boolean) ?? false
}
export const getSkipSameChapter = async (stateManager: SourceStateManager): Promise<boolean> => {
    return (await stateManager.retrieve('skip_same_chapter') as boolean) ?? false
}
export const getDaysToLookBack = async (stateManager: SourceStateManager): Promise<number> => {
    return Math.max(parseFloat((await stateManager.retrieve('days_to_look_back') as string) ?? '0'), 0)
}
export const contentSettings = (stateManager: SourceStateManager): DUINavigationButton => {
    return App.createDUINavigationButton({
        id: 'content_settings',
        label: 'Content Settings',
        form: App.createDUIForm({
            onSubmit: (values: any) => {
                return Promise.all([
                    stateManager.store('languages', values.languages),
                    stateManager.store('ratings', values.ratings),
                    stateManager.store('data_saver', values.data_saver),
                    stateManager.store('skip_same_chapter', values.skip_same_chapter),
                    stateManager.store('days_to_look_back', values.days_to_look_back)
                ]).then()
            },
            sections: () => {
                return Promise.resolve([
                    App.createDUISection({
                        id: 'content',
                        footer: 'When enabled, same chapters from different scanlation group will not be shown.',
                        isHidden: false,
                        rows: async () => {
                            return [
                                App.createDUISelect({
                                    id: 'languages',
                                    label: 'Languages',
                                    options: MDLanguages.getMDCodeList(),
                                    labelResolver:  async option => MDLanguages.getName(option),
                                    value: App.createDUIBinding({
                                        get: async () => await getLanguages(stateManager)
                                    }),
                                    allowsMultiselect: true
                                }),
                                App.createDUISelect({
                                    id: 'ratings',
                                    label: 'Content Rating',
                                    options: MDRatings.getEnumList(),
                                    labelResolver: async option => MDRatings.getName(option),
                                    value: App.createDUIBinding({
                                        get: async () => await getRatings(stateManager)
                                    }),
                                    allowsMultiselect: true
                                }),
                                App.createDUIInputField({
                                    id: 'days_to_look_back',
                                    label: 'Days to look back during update',
                                    value: App.createDUIBinding({
                                        get: async () => await getDaysToLookBack(stateManager)
                                    })
                                }),
                                App.createDUISwitch({
                                    id: 'data_saver',
                                    label: 'Data Saver',
                                    value: App.createDUIBinding({
                                        get: async () => await getDataSaver(stateManager)
                                    })
                                }),
                                App.createDUISwitch({
                                    id: 'skip_same_chapter',
                                    label: 'Skip Same Chapter',
                                    value: App.createDUIBinding({
                                        get: async () => await getSkipSameChapter(stateManager)
                                    })
                                })
                            ]
                        }
                    })
                ])
            }
        })
    })
}
export const getHomepageThumbnail = async (stateManager: SourceStateManager): Promise<string> => {
    return (await stateManager.retrieve('homepage_thumbnail') as string) ?? MDImageQuality.getDefault('homepage')
}
export const getSearchThumbnail = async (stateManager: SourceStateManager): Promise<string> => {
    return (await stateManager.retrieve('search_thumbnail') as string) ?? MDImageQuality.getDefault('search')
}
export const getMangaThumbnail = async (stateManager: SourceStateManager): Promise<string> => {
    return (await stateManager.retrieve('manga_thumbnail') as string) ?? MDImageQuality.getDefault('manga')
}
export const getAccessToken = async (stateManager: SourceStateManager): Promise<{
    accessToken: string;
    refreshToken: string | undefined;
    tokenBody: any | undefined;
} | undefined> => {
    const accessToken = await stateManager.keychain.retrieve('access_token') as string | undefined
    if (!accessToken)
        return undefined
    const refreshToken = await stateManager.keychain.retrieve('refresh_token') as string | undefined
    return {
        accessToken,
        refreshToken,
        tokenBody: await parseAccessToken(accessToken)
    }
}
export const saveAccessToken = async (stateManager: SourceStateManager, accessToken: string | undefined, refreshToken: string | undefined): Promise<{
    accessToken: string;
    refreshToken: string | undefined;
    tokenBody: any | undefined;
} | undefined> => {
    await Promise.all([
        stateManager.keychain.store('access_token', accessToken),
        stateManager.keychain.store('refresh_token', refreshToken)
    ])
    if (!accessToken)
        return undefined
    return {
        accessToken,
        refreshToken,
        tokenBody: await parseAccessToken(accessToken)
    }
}
export const parseAccessToken = async (accessToken: string | undefined): Promise<any | undefined> => {
    if (!accessToken)
        return undefined
    const tokenBodyBase64 = accessToken.split('.')[1]
    if (!tokenBodyBase64)
        return undefined
    const tokenBodyJSON = Buffer.from(tokenBodyBase64, 'base64').toString('ascii')
    return JSON.parse(tokenBodyJSON)
}
const authRequestCache: Record<string, Promise<any | undefined>> = {}
export const authEndpointRequest = (requestManager: RequestManager, endpoint: 'login' | 'refresh' | 'logout', payload: any): Promise<any | undefined> => {
    let request = authRequestCache[endpoint]
    if (request == undefined) {
        request = _authEndpointRequest(requestManager, endpoint, payload).finally(() => { delete authRequestCache[endpoint] })
        authRequestCache[endpoint] = request
    }
    return request
}
const _authEndpointRequest = async (requestManager: RequestManager, endpoint: 'login' | 'refresh' | 'logout', payload: any): Promise<any | undefined> => {
    const response = await requestManager.schedule(App.createRequest({
        method: 'POST',
        url: 'https://api.mangadex.org/auth/' + endpoint,
        headers: {
            'content-type': 'application/json'
        },
        data: payload
    }), 1)
    if (response.status > 399) {
        throw new Error('Request failed with error code:' + response.status)
    }
    const jsonData = typeof (response.data) === 'string' ? JSON.parse(response.data) : response.data
    if (jsonData.result != 'ok') {
        throw new Error('Request failed with errors: ' + jsonData.errors.map((x: any) => `[${x.title}]: ${x.detail}`))
    }
    return jsonData
}
export const accountSettings = async (stateManager: SourceStateManager, requestManager: RequestManager): Promise<DUIFormRow> => {
    const accessToken = await getAccessToken(stateManager)
    if (!accessToken) {
        return App.createDUINavigationButton({
            id: 'login_button',
            label: 'Login',
            form: App.createDUIForm({
                onSubmit: async (values) => {
                    if (!values.username) {
                        throw new Error('Username must not be empty')
                    }
                    if (!values.password) {
                        throw new Error('Password must not be empty')
                    }
                    const response = await authEndpointRequest(requestManager, 'login', {
                        username: values.username,
                        password: values.password
                    })
                    await saveAccessToken(stateManager, response.token.session, response.token.refresh)
                },
                sections: async () => [
                    App.createDUISection({
                        id: 'username_section',
                        header: 'Username',
                        footer: 'Enter your MangaDex account username',
                        isHidden: false,
                        rows: async () => [
                            App.createDUIInputField({
                                id: 'username',
                                label: 'Username',
                                value: App.createDUIBinding({
                                    get: async () => ''
                                })
                            })
                        ]
                    }),
                    App.createDUISection({
                        id: 'password_section',
                        header: 'Password',
                        footer: 'Enter the password associated with your MangaDex account Username',
                        isHidden: false,
                        rows: async () => [
                            App.createDUISecureInputField({
                                id: 'password',
                                label: 'Password',
                                value: App.createDUIBinding({
                                    get: async () => ''
                                })
                            })
                        ]
                    })
                ]
            })
        })
    }
    return App.createDUINavigationButton({
        id: 'account_settings',
        label: 'Session Info',
        form: App.createDUIForm({
            onSubmit: async () => undefined,
            sections: async () => {
                const accessToken = await getAccessToken(stateManager)
                if (!accessToken) {
                    return [
                        App.createDUISection({
                            id: 'not_logged_in_section',
                            isHidden: false,
                            rows: async () => [
                                App.createDUILabel({
                                    id: 'not_logged_in',
                                    label: 'Not Logged In',
                                    value: undefined
                                })
                            ]
                        })
                    ]
                }
                return [
                    App.createDUISection({
                        id: 'introspect',
                        isHidden: false,
                        rows: async () => {
                            return Object.keys(accessToken.tokenBody).map(key => {
                                const value = accessToken.tokenBody[key]
                                return App.createDUIMultilineLabel({
                                    id: key,
                                    label: key,
                                    value: Array.isArray(value) ? value.join('\n') : `${value}`
                                })
                            })
                        }
                    }),
                    App.createDUISection({
                        id: 'refresh_button_section',
                        isHidden: false,
                        rows: async () => [
                            App.createDUIButton({
                                id: 'refresh_token_button',
                                label: 'Refresh Token',
                                onTap: async () => {
                                    const response = await authEndpointRequest(requestManager, 'refresh', {
                                        token: accessToken.refreshToken
                                    })
                                    await saveAccessToken(stateManager, response.token.session, response.token.refresh)
                                }
                            }),
                            App.createDUIButton({
                                id: 'logout_button',
                                label: 'Logout',
                                onTap: async () => {
                                    await authEndpointRequest(requestManager, 'logout', {})
                                    await saveAccessToken(stateManager, undefined, undefined)
                                }
                            })
                        ]
                    })
                ]
            }
        })
    })
}
export const thumbnailSettings = (stateManager: SourceStateManager): DUINavigationButton => {
    return App.createDUINavigationButton({
        id: 'thumbnail_settings',
        label: 'Thumbnail Quality',
        form: App.createDUIForm({
            onSubmit: (values: any) => {
                return Promise.all([
                    stateManager.store('homepage_thumbnail', values.homepage_thumbnail[0]),
                    stateManager.store('search_thumbnail', values.search_thumbnail[0]),
                    stateManager.store('manga_thumbnail', values.manga_thumbnail[0]),
                ]).then()
            },
            sections: () => {
                return Promise.resolve([
                    App.createDUISection({
                        id: 'thumbnail',
                        isHidden: false,
                        rows: async () => {
                            return [
                                App.createDUISelect({
                                    id: 'homepage_thumbnail',
                                    label: 'Homepage Thumbnail',
                                    options: MDImageQuality.getEnumList(),
                                    labelResolver: async option => MDImageQuality.getName(option),
                                    value: App.createDUIBinding({
                                        get: async () => [await getHomepageThumbnail(stateManager)]
                                    }),
                                    allowsMultiselect: false
                                }),
                                App.createDUISelect({
                                    id: 'search_thumbnail',
                                    label: 'Search Thumbnail',
                                    options: MDImageQuality.getEnumList(),
                                    labelResolver: async option => MDImageQuality.getName(option),
                                    value: App.createDUIBinding({
                                        get: async () => [await getSearchThumbnail(stateManager)]
                                    }),
                                    allowsMultiselect: false,
                                }),
                                App.createDUISelect({
                                    id: 'manga_thumbnail',
                                    label: 'Manga Thumbnail',
                                    options: MDImageQuality.getEnumList(),
                                    labelResolver: async option => MDImageQuality.getName(option),
                                    value: App.createDUIBinding({
                                        get: async () => [await getMangaThumbnail(stateManager)]
                                    }),
                                    allowsMultiselect: false,
                                })
                            ]
                        }
                    })
                ])
            }
        })
    })
}
export const resetSettings = (stateManager: SourceStateManager): DUIButton => {
    return App.createDUIButton({
        id: 'reset',
        label: 'Reset to Default',
        onTap: () => {
            return Promise.all([
                stateManager.store('languages', null),
                stateManager.store('ratings', null),
                stateManager.store('data_saver', null),
                stateManager.store('skip_same_chapter', null),
                stateManager.store('homepage_thumbnail', null),
                stateManager.store('search_thumbnail', null),
                stateManager.store('manga_thumbnail', null),
                stateManager.store('recommendedIds', null),
                stateManager.store('enabled_homepage_sections', null),
                stateManager.store('enabled_recommendations', null),
                stateManager.store('amount_of_recommendations', null)
            ]).then()
        }
    })
}
export const getEnabledHomePageSections = async (stateManager: SourceStateManager): Promise<string[]> => {
    const enabled_homepage_sections: string[] = await stateManager.retrieve('enabled_homepage_sections') as string[]
    return enabled_homepage_sections != undefined && enabled_homepage_sections.length > 0 ? enabled_homepage_sections : MDHomepageSections.getDefault()
}
export const getEnabledRecommendations = async (stateManager: SourceStateManager): Promise<boolean> => {
    return (await stateManager.retrieve('enabled_recommendations') as boolean) ?? false
}
export const getAmountRecommendations = async (stateManager: SourceStateManager): Promise<number> => {
    return (await stateManager.retrieve('amount_of_recommendations') as number) ?? 5
}
export const homepageSettings = (stateManager: SourceStateManager): DUINavigationButton => {
    return App.createDUINavigationButton({
        id: 'homepage_settings',
        label: 'Homepage Settings',
        form: App.createDUIForm({
            onSubmit: (values: any) => {
                return Promise.all([
                    stateManager.store('enabled_homepage_sections', values.enabled_homepage_sections),
                    // The `as boolean` seems required to prevent Paperback from throwing
                    // `Invalid type for key value; expected `Bool` got `Optional<JSValue>``
                    stateManager.store('enabled_recommendations', values.enabled_recommendations as boolean),
                    stateManager.store('amount_of_recommendations', values.amount_of_recommendations),
                    sliceRecommendedIds(stateManager, values.amount_of_recommendations),
                ]).then()
            },
            sections: () => {
                return Promise.resolve([
                    App.createDUISection({
                        id: 'homepage_sections_section',
                        //footer: 'Which sections should be shown on the homepage',
                        isHidden: false,
                        rows: async () => {
                            return [
                                App.createDUISelect({
                                    id: 'enabled_homepage_sections',
                                    label: 'Homepage sections',
                                    options: MDHomepageSections.getEnumList(),
                                    labelResolver: async option => MDHomepageSections.getName(option),
                                    value: App.createDUIBinding({
                                        get: async () => await getEnabledHomePageSections(stateManager) ?? []
                                    }),
                                    allowsMultiselect: true
                                }),
                            ]
                        }
                    }),
                    App.createDUISection({
                        id: 'recommendations_settings_section',
                        header: 'Titles recommendations',
                        footer: 'Recommendation are based on recently read chapters and shown on the homepage',
                        isHidden: false,
                        rows: async () => {
                            return [
                                App.createDUISwitch({
                                    id: 'enabled_recommendations',
                                    label: 'Enable recommendations',
                                    value: App.createDUIBinding({
                                        get: async () => await getEnabledRecommendations(stateManager) ?? false
                                    })
                                }),
                                App.createDUIStepper({
                                    id: 'amount_of_recommendations',
                                    label: 'Amount of recommendation',
                                    value: App.createDUIBinding({
                                        get: async () => await getAmountRecommendations(stateManager) ?? 5
                                    }),
                                    min: 1,
                                    max: 15,
                                    step: 1
                                }),
                                App.createDUIButton({
                                    id: 'reset_recommended_ids',
                                    label: 'Reset recommended titles',
                                    onTap: () => {
                                        return Promise.all([
                                            stateManager.store('recommendedIds', null),
                                        ]).then()
                                    }
                                })
                            ]
                        }
                    }),
                ])
            }
        })
    })
}
