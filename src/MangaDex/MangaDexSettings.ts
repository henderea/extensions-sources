import { Button, FormRow, NavigationButton, RequestManager, SourceStateManager } from "@paperback/types";
import { MDLanguages, MDRatings, MDImageQuality, MDHomepageSections } from './MangaDexHelper';
import { sliceRecommendedIds,
//getRecommendedIds
 } from './MangaDexSimilarManga';
export const getLanguages = async (stateManager: SourceStateManager): Promise<string[]> => {
    return (await stateManager.retrieve("languages") as string[]) ?? MDLanguages.getDefault();
};
export const getRatings = async (stateManager: SourceStateManager): Promise<string[]> => {
    return (await stateManager.retrieve("ratings") as string[]) ?? MDRatings.getDefault();
};
export const getDataSaver = async (stateManager: SourceStateManager): Promise<boolean> => {
    return (await stateManager.retrieve("data_saver") as boolean) ?? false;
};
export const getSkipSameChapter = async (stateManager: SourceStateManager): Promise<boolean> => {
    return (await stateManager.retrieve("skip_same_chapter") as boolean) ?? false;
};
export const getDaysToLookBack = async (stateManager: SourceStateManager): Promise<number> => {
    return Math.max(parseFloat((await stateManager.retrieve("days_to_look_back") as string) ?? "0"), 0);
};
export const contentSettings = (stateManager: SourceStateManager): NavigationButton => {
    return App.createNavigationButton({
        id: "content_settings",
        value: "",
        label: "Content Settings",
        form: App.createForm({
            onSubmit: (values: any) => {
                return Promise.all([
                    stateManager.store("languages", values.languages),
                    stateManager.store("ratings", values.ratings),
                    stateManager.store("data_saver", values.data_saver),
                    stateManager.store("skip_same_chapter", values.skip_same_chapter),
                    stateManager.store("days_to_look_back", values.days_to_look_back)
                ]).then();
            },
            validate: () => {
                return Promise.resolve(true);
            },
            sections: () => {
                return Promise.resolve([
                    App.createSection({
                        id: "content",
                        footer: "When enabled, same chapters from different scanlation group will not be shown.",
                        rows: () => {
                            return Promise.all([
                                getLanguages(stateManager),
                                getRatings(stateManager),
                                getDataSaver(stateManager),
                                getSkipSameChapter(stateManager),
                                getDaysToLookBack(stateManager)
                            ]).then(async (values) => {
                                return [
                                    App.createSelect({
                                        id: "languages",
                                        label: "Languages",
                                        options: MDLanguages.getMDCodeList(),
                                        displayLabel: option => MDLanguages.getName(option),
                                        value: values[0],
                                        allowsMultiselect: true,
                                        minimumOptionCount: 1
                                    }),
                                    App.createSelect({
                                        id: "ratings",
                                        label: "Content Rating",
                                        options: MDRatings.getEnumList(),
                                        displayLabel: option => MDRatings.getName(option),
                                        value: values[1],
                                        allowsMultiselect: true,
                                        minimumOptionCount: 1
                                    }),
                                    App.createInputField({
                                        id: "days_to_look_back",
                                        placeholder: "Days to look back during update",
                                        value: values[4] + "",
                                        maskInput: false
                                    }),
                                    App.createSwitch({
                                        id: "data_saver",
                                        label: "Data Saver",
                                        value: values[2]
                                    }),
                                    App.createSwitch({
                                        id: "skip_same_chapter",
                                        label: "Skip Same Chapter",
                                        value: values[3]
                                    })
                                ];
                            });
                        }
                    })
                ]);
            }
        })
    });
};
export const getHomepageThumbnail = async (stateManager: SourceStateManager): Promise<string> => {
    return (await stateManager.retrieve("homepage_thumbnail") as string) ?? MDImageQuality.getDefault("homepage");
};
export const getSearchThumbnail = async (stateManager: SourceStateManager): Promise<string> => {
    return (await stateManager.retrieve("search_thumbnail") as string) ?? MDImageQuality.getDefault("search");
};
export const getMangaThumbnail = async (stateManager: SourceStateManager): Promise<string> => {
    return (await stateManager.retrieve("manga_thumbnail") as string) ?? MDImageQuality.getDefault("manga");
};
export const getAccessToken = async (stateManager: SourceStateManager): Promise<{
    accessToken: string;
    refreshToken: string | undefined;
    tokenBody: any | undefined;
} | undefined> => {
    const accessToken = await stateManager.keychain.retrieve("access_token") as string | undefined;
    if (!accessToken)
        return undefined;
    const refreshToken = await stateManager.keychain.retrieve("refresh_token") as string | undefined;
    return {
        accessToken,
        refreshToken,
        tokenBody: await parseAccessToken(accessToken)
    };
};
export const saveAccessToken = async (stateManager: SourceStateManager, accessToken: string | undefined, refreshToken: string | undefined): Promise<{
    accessToken: string;
    refreshToken: string | undefined;
    tokenBody: any | undefined;
} | undefined> => {
    await Promise.all([
        stateManager.keychain.store("access_token", accessToken),
        stateManager.keychain.store("refresh_token", refreshToken)
    ]);
    if (!accessToken)
        return undefined;
    return {
        accessToken,
        refreshToken,
        tokenBody: await parseAccessToken(accessToken)
    };
};
export const parseAccessToken = async (accessToken: string | undefined): Promise<any | undefined> => {
    if (!accessToken)
        return undefined;
    const tokenBodyBase64 = accessToken.split(".")[1];
    if (!tokenBodyBase64)
        return undefined;
    const tokenBodyJSON = Buffer.from(tokenBodyBase64, "base64").toString("ascii");
    return JSON.parse(tokenBodyJSON);
};
const authRequestCache: Record<string, Promise<any | undefined>> = {};
export const authEndpointRequest = (requestManager: RequestManager, endpoint: "login" | "refresh" | "logout", payload: any): Promise<any | undefined> => {
    let request = authRequestCache[endpoint];
    if (request == undefined) {
        request = _authEndpointRequest(requestManager, endpoint, payload).finally(() => { delete authRequestCache[endpoint]; });
        authRequestCache[endpoint] = request;
    }
    return request;
};
const _authEndpointRequest = async (requestManager: RequestManager, endpoint: "login" | "refresh" | "logout", payload: any): Promise<any | undefined> => {
    const response = await requestManager.schedule(App.createRequest({
        method: "POST",
        url: "https://api.mangadex.org/auth/" + endpoint,
        headers: {
            "content-type": "application/json"
        },
        data: payload
    }), 1);
    if (response.status > 399) {
        throw new Error("Request failed with error code:" + response.status);
    }
    const jsonData = typeof (response.data) === "string" ? JSON.parse(response.data) : response.data;
    if (jsonData.result != "ok") {
        throw new Error("Request failed with errors: " + jsonData.errors.map((x: any) => `[${x.title}]: ${x.detail}`));
    }
    return jsonData;
};
export const accountSettings = async (stateManager: SourceStateManager, requestManager: RequestManager): Promise<FormRow> => {
    const accessToken = await getAccessToken(stateManager);
    if (!accessToken) {
        return App.createNavigationButton({
            id: "login_button",
            label: "Login",
            value: undefined,
            form: App.createForm({
                onSubmit: async (values) => {
                    if (!values.username) {
                        throw new Error("Username must not be empty");
                    }
                    if (!values.password) {
                        throw new Error("Password must not be empty");
                    }
                    const response = await authEndpointRequest(requestManager, "login", {
                        username: values.username,
                        password: values.password
                    });
                    await saveAccessToken(stateManager, response.token.session, response.token.refresh);
                },
                validate: async () => true,
                sections: async () => [
                    App.createSection({
                        id: "username_section",
                        header: "Username",
                        footer: "Enter your MangaDex account username",
                        rows: async () => [
                            App.createInputField({
                                id: "username",
                                placeholder: "Username",
                                value: "",
                                maskInput: false
                            })
                        ]
                    }),
                    App.createSection({
                        id: "password_section",
                        header: "Password",
                        footer: "Enter the password associated with your MangaDex account Username",
                        rows: async () => [
                            App.createInputField({
                                id: "password",
                                placeholder: "Password",
                                value: "",
                                maskInput: true
                            })
                        ]
                    })
                ]
            })
        });
    }
    return App.createNavigationButton({
        id: "account_settings",
        value: undefined,
        label: "Session Info",
        form: App.createForm({
            onSubmit: async () => undefined,
            validate: async () => true,
            sections: async () => {
                const accessToken = await getAccessToken(stateManager);
                if (!accessToken) {
                    return [
                        App.createSection({
                            id: "not_logged_in_section",
                            rows: async () => [
                                App.createLabel({
                                    id: "not_logged_in",
                                    label: "Not Logged In",
                                    value: undefined
                                })
                            ]
                        })
                    ];
                }
                return [
                    App.createSection({
                        id: "introspect",
                        rows: async () => {
                            return Object.keys(accessToken.tokenBody).map(key => {
                                const value = accessToken.tokenBody[key];
                                return App.createMultilineLabel({
                                    id: key,
                                    label: key,
                                    value: Array.isArray(value) ? value.join("\n") : `${value}`
                                });
                            });
                        }
                    }),
                    App.createSection({
                        id: "refresh_button_section",
                        rows: async () => [
                            App.createButton({
                                id: "refresh_token_button",
                                label: "Refresh Token",
                                value: undefined,
                                onTap: async () => {
                                    const response = await authEndpointRequest(requestManager, "refresh", {
                                        token: accessToken.refreshToken
                                    });
                                    await saveAccessToken(stateManager, response.token.session, response.token.refresh);
                                }
                            }),
                            App.createButton({
                                id: "logout_button",
                                label: "Logout",
                                value: undefined,
                                onTap: async () => {
                                    await authEndpointRequest(requestManager, "logout", {});
                                    await saveAccessToken(stateManager, undefined, undefined);
                                }
                            })
                        ]
                    })
                ];
            }
        })
    });
};
export const thumbnailSettings = (stateManager: SourceStateManager): NavigationButton => {
    return App.createNavigationButton({
        id: "thumbnail_settings",
        value: "",
        label: "Thumbnail Quality",
        form: App.createForm({
            onSubmit: (values: any) => {
                return Promise.all([
                    stateManager.store("homepage_thumbnail", values.homepage_thumbnail[0]),
                    stateManager.store("search_thumbnail", values.search_thumbnail[0]),
                    stateManager.store("manga_thumbnail", values.manga_thumbnail[0]),
                ]).then();
            },
            validate: () => {
                return Promise.resolve(true);
            },
            sections: () => {
                return Promise.resolve([
                    App.createSection({
                        id: "thumbnail",
                        rows: () => {
                            return Promise.all([
                                getHomepageThumbnail(stateManager),
                                getSearchThumbnail(stateManager),
                                getMangaThumbnail(stateManager)
                            ]).then(async (values) => {
                                return [
                                    App.createSelect({
                                        id: "homepage_thumbnail",
                                        label: "Homepage Thumbnail",
                                        options: MDImageQuality.getEnumList(),
                                        displayLabel: option => MDImageQuality.getName(option),
                                        value: [values[0]],
                                        allowsMultiselect: false,
                                        minimumOptionCount: 1
                                    }),
                                    App.createSelect({
                                        id: "search_thumbnail",
                                        label: "Search Thumbnail",
                                        options: MDImageQuality.getEnumList(),
                                        displayLabel: option => MDImageQuality.getName(option),
                                        value: [values[1]],
                                        allowsMultiselect: false,
                                        minimumOptionCount: 1
                                    }),
                                    App.createSelect({
                                        id: "manga_thumbnail",
                                        label: "Manga Thumbnail",
                                        options: MDImageQuality.getEnumList(),
                                        displayLabel: option => MDImageQuality.getName(option),
                                        value: [values[2]],
                                        allowsMultiselect: false,
                                        minimumOptionCount: 1
                                    })
                                ];
                            });
                        }
                    })
                ]);
            }
        })
    });
};
export const resetSettings = (stateManager: SourceStateManager): Button => {
    return App.createButton({
        id: "reset",
        label: "Reset to Default",
        value: "",
        onTap: () => {
            return Promise.all([
                stateManager.store("languages", null),
                stateManager.store("ratings", null),
                stateManager.store("data_saver", null),
                stateManager.store("skip_same_chapter", null),
                stateManager.store("homepage_thumbnail", null),
                stateManager.store("search_thumbnail", null),
                stateManager.store("manga_thumbnail", null),
                stateManager.store("recommendedIds", null),
                stateManager.store("enabled_homepage_sections", null),
                stateManager.store("enabled_recommendations", null),
                stateManager.store("amount_of_recommendations", null)
            ]).then();
        }
    });
};
export const getEnabledHomePageSections = async (stateManager: SourceStateManager): Promise<string[]> => {
    const enabled_homepage_sections: string[] = await stateManager.retrieve("enabled_homepage_sections") as string[];
    return enabled_homepage_sections != undefined && enabled_homepage_sections.length > 0 ? enabled_homepage_sections : MDHomepageSections.getDefault();
};
export const getEnabledRecommendations = async (stateManager: SourceStateManager): Promise<boolean> => {
    return (await stateManager.retrieve("enabled_recommendations") as boolean) ?? false;
};
export const getAmountRecommendations = async (stateManager: SourceStateManager): Promise<number> => {
    return (await stateManager.retrieve("amount_of_recommendations") as number) ?? 5;
};
export const homepageSettings = (stateManager: SourceStateManager): NavigationButton => {
    return App.createNavigationButton({
        id: "homepage_settings",
        value: "",
        label: "Homepage Settings",
        form: App.createForm({
            onSubmit: (values: any) => {
                return Promise.all([
                    stateManager.store("enabled_homepage_sections", values.enabled_homepage_sections),
                    // The `as boolean` seems required to prevent Paperback from throwing
                    // `Invalid type for key value; expected `Bool` got `Optional<JSValue>``
                    stateManager.store("enabled_recommendations", values.enabled_recommendations as boolean),
                    stateManager.store("amount_of_recommendations", values.amount_of_recommendations),
                    sliceRecommendedIds(stateManager, values.amount_of_recommendations),
                ]).then();
            },
            validate: () => {
                return Promise.resolve(true);
            },
            sections: () => {
                return Promise.resolve([
                    App.createSection({
                        id: "homepage_sections_section",
                        //footer: 'Which sections should be shown on the homepage',
                        rows: () => {
                            return Promise.all([
                                getEnabledHomePageSections(stateManager),
                            ]).then(async (values) => {
                                return [
                                    App.createSelect({
                                        id: "enabled_homepage_sections",
                                        label: "Homepage sections",
                                        options: MDHomepageSections.getEnumList(),
                                        displayLabel: option => MDHomepageSections.getName(option),
                                        value: values[0] ?? [],
                                        allowsMultiselect: true,
                                        minimumOptionCount: 0
                                    }),
                                ];
                            });
                        }
                    }),
                    App.createSection({
                        id: "recommendations_settings_section",
                        header: "Titles recommendations",
                        footer: "Recommendation are based on recently read chapters and shown on the homepage",
                        rows: () => {
                            return Promise.all([
                                getEnabledRecommendations(stateManager),
                                getAmountRecommendations(stateManager),
                                // Can be used to debug recommended ids
                                //getRecommendedIds(stateManager)
                            ]).then(async (values) => {
                                return [
                                    App.createSwitch({
                                        id: "enabled_recommendations",
                                        label: "Enable recommendations",
                                        value: values[0] ?? false
                                    }),
                                    App.createStepper({
                                        id: "amount_of_recommendations",
                                        label: "Amount of recommendation",
                                        value: values[1] ?? 5,
                                        min: 1,
                                        max: 15,
                                        step: 1
                                    }),
                                    App.createButton({
                                        id: "reset_recommended_ids",
                                        label: "Reset recommended titles",
                                        value: "",
                                        onTap: () => {
                                            return Promise.all([
                                                stateManager.store("recommendedIds", null),
                                            ]).then();
                                        }
                                    })
                                ];
                            });
                        }
                    }),
                ]);
            }
        })
    });
};
