import {Injectable, Inject, Optional} from '@angular/core';

import {Type, isDefined} from 'caesium-core/lang';
import {Codec} from 'caesium-core/codec';
import {memoize} from 'caesium-core/decorators';

import {ModelFactory, createModelFactory} from '../model/factory';
import {ModelMetadata} from '../model/metadata';
import {ModelBase} from '../model/base';

import {model, union, JsonObject} from '../json_codecs';

import {ModelHttp} from './model_http';
import {RequestFactory, Response} from './request';

import {Search, SearchParameter, SEARCH_PAGE_SIZE} from './search';
import {NotSupportedError, InvalidMetadata, FactoryException} from "../exceptions";

/**
 * Rather than expect all manager implementations to declare @Injectable
 * _and_ the correct parameters, this class encapsulates all injectable
 * parameters for the model manager.
 */
@Injectable()
export class ManagerOptions {
    static DefaultSearchPageSize = 20;

    http: ModelHttp;
    searchPageSize: number;

    constructor(
        http: ModelHttp,
        @Optional()  @Inject(SEARCH_PAGE_SIZE) searchPageSize?: number
    ) {
        this.http = http;
        if (!isDefined(searchPageSize)) {
            this.searchPageSize = ManagerOptions.DefaultSearchPageSize;
        } else {
            this.searchPageSize = searchPageSize;
        }
    }
}

export abstract class ManagerBase<T extends ModelBase> {
    http: ModelHttp;
    _requestFactory: RequestFactory;
    searchPageSize: number;


    abstract getModelType(): Type/*<T>*/;

    /**
     * Get a list of the proper subtypes of the model.
     */
    abstract getModelSubtypes(): Type/*<U extends T>*/[];

    /**
     * Get the search parameters that are applicable to the `search` exposed by
     * this manager.
     *
     * If the model does not support any search, should return `undefined`
     */
    abstract getSearchParameters(): SearchParameter[];

    protected get __metadata(): ModelMetadata {
        return ModelMetadata.forType(this.getModelType());
    }

    constructor(options: ManagerOptions) {
        this.http = options.http;
        this._requestFactory = new RequestFactory(this.http, this.__metadata);
        this.searchPageSize = options.searchPageSize;
    }

    /// Create a new instance of the modelType.
    create<U extends T>(subtype: Type/*<U>*/, args: {[propName: string]: any}): U {
        var factory: ModelFactory<U>;
        if (this.__metadata.isAbstract) {
            var modelSubtypes = this.getModelSubtypes();
            if (!Array.isArray(modelSubtypes) || !modelSubtypes.find((s) => s === subtype)) {
                throw new FactoryException(
                    `Subtype must be a registered subtype of model manager for '${this.__metadata.kind}'`
                );
            }
            factory = createModelFactory<U>(ModelMetadata.forType(subtype));
        } else {
            factory = createModelFactory<U>(this.__metadata);
        }
        return factory(args);
    }

    @memoize()
    private _getDefaultJsonCodec(): Codec<T,JsonObject> {
        var modelSubtypes = this.getModelSubtypes();
        if (Array.isArray(modelSubtypes) && modelSubtypes.length > 0) {
            return union(...this.getModelSubtypes());
        } else if (this.__metadata.isAbstract) {
            throw new InvalidMetadata(
                'A manager for an abstract model type must provide a nonempty list of subtypes'
            );
        } else {
            return model<T>(this.getModelType());
        }
    }

    get modelCodec(): Codec<T,JsonObject> {
        return this._getDefaultJsonCodec();
    }

    getById(id: any): Response {
        var request = this._requestFactory.get(id);
        return request.send();
    }

    search(): Search<T> {
        if (!isDefined(this.getSearchParameters())) {
            throw new NotSupportedError(`${this.getModelType()} manager does not support search`);
        }
        return new Search<T>(
            this._requestFactory,
            this.getSearchParameters(),
            this.modelCodec,
            this.searchPageSize
        );
    }

}

