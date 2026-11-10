import { PrismaClient, Prisma, Category, ProductFamily, Product, ProductVariant, UnitOfMeasure, LifecycleStatus } from '@prisma/client';
import { prisma as defaultPrisma } from '../../../database';

export class ProductsRepository {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  // ==========================================
  // Category Operations
  // ==========================================
  async findCategoryById(id: string): Promise<Category | null> {
    return this.prisma.category.findUnique({ where: { id } });
  }

  async findCategoryByCode(code: string): Promise<Category | null> {
    return this.prisma.category.findUnique({ where: { code } });
  }

  async findUomById(id: string): Promise<UnitOfMeasure | null> {
    return this.prisma.unitOfMeasure.findUnique({ where: { id } });
  }

  async listCategories(params?: {
    status?: LifecycleStatus;
    parentId?: string | null;
    search?: string;
    skip?: number;
    take?: number;
  }): Promise<{ items: Category[]; total: number }> {
    const where: Prisma.CategoryWhereInput = {};
    if (params?.status) where.status = params.status;
    if (params?.parentId !== undefined) where.parentId = params.parentId;
    if (params?.search) {
      where.OR = [
        { code: { contains: params.search, mode: 'insensitive' } },
        { name: { contains: params.search, mode: 'insensitive' } }
      ];
    }
    const [items, total] = await Promise.all([
      this.prisma.category.findMany({
        where,
        skip: params?.skip,
        take: params?.take,
        orderBy: { createdAt: 'desc' }
      }),
      this.prisma.category.count({ where })
    ]);
    return { items, total };
  }

  async createCategory(data: Prisma.CategoryCreateInput): Promise<Category> {
    return this.prisma.category.create({ data });
  }

  async updateCategory(id: string, data: Prisma.CategoryUpdateInput): Promise<Category> {
    return this.prisma.category.update({ where: { id }, data });
  }

  async countCategoryActiveReferences(categoryId: string): Promise<{
    childCategories: number;
    productFamilies: number;
    products: number;
    materials: number;
  }> {
    const activeStatuses: LifecycleStatus[] = ['APPROVED', 'ACTIVE'];
    const [childCategories, productFamilies, products, materials] = await Promise.all([
      this.prisma.category.count({ where: { parentId: categoryId, status: { in: activeStatuses } } }),
      this.prisma.category.findUnique({ where: { id: categoryId } }).productFamilies({ where: { status: { in: activeStatuses } } }).then(res => res?.length || 0),
      this.prisma.product.count({ where: { categoryId, status: { in: activeStatuses } } }),
      this.prisma.material.count({ where: { categoryId, status: { in: activeStatuses } } })
    ]);
    return { childCategories, productFamilies, products, materials };
  }

  // ==========================================
  // ProductFamily Operations
  // ==========================================
  async findFamilyById(id: string): Promise<ProductFamily | null> {
    return this.prisma.productFamily.findUnique({ where: { id }, include: { category: true } });
  }

  async findFamilyByCode(code: string): Promise<ProductFamily | null> {
    return this.prisma.productFamily.findUnique({ where: { code } });
  }

  async listFamilies(params?: {
    categoryId?: string;
    status?: LifecycleStatus;
    search?: string;
    skip?: number;
    take?: number;
  }): Promise<{ items: ProductFamily[]; total: number }> {
    const where: Prisma.ProductFamilyWhereInput = {};
    if (params?.categoryId) where.categoryId = params.categoryId;
    if (params?.status) where.status = params.status;
    if (params?.search) {
      where.OR = [
        { code: { contains: params.search, mode: 'insensitive' } },
        { name: { contains: params.search, mode: 'insensitive' } }
      ];
    }
    const [items, total] = await Promise.all([
      this.prisma.productFamily.findMany({
        where,
        skip: params?.skip,
        take: params?.take,
        include: { category: true },
        orderBy: { createdAt: 'desc' }
      }),
      this.prisma.productFamily.count({ where })
    ]);
    return { items, total };
  }

  async createFamily(data: Prisma.ProductFamilyCreateInput): Promise<ProductFamily> {
    return this.prisma.productFamily.create({ data });
  }

  async updateFamily(id: string, data: Prisma.ProductFamilyUpdateInput): Promise<ProductFamily> {
    const categoryId = typeof data.category === 'object' && data.category && 'connect' in data.category
      ? data.category.connect?.id
      : undefined;
    if (!categoryId) return this.prisma.productFamily.update({ where: { id }, data });

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.productFamily.update({ where: { id }, data });
      const familyMaterials = await tx.material.findMany({
        where: { specs: { path: ['productFamilyId'], equals: id } },
        select: { id: true, specs: true },
      });
      await Promise.all([
        tx.product.updateMany({ where: { productFamilyId: id }, data: { categoryId } }),
        ...familyMaterials.map((material) => tx.material.update({
          where: { id: material.id },
          data: {
            categoryId,
            specs: { ...(material.specs as Prisma.JsonObject), categoryId },
          },
        })),
      ]);
      return updated;
    });
  }

  async countFamilyActiveProducts(familyId: string): Promise<number> {
    return this.prisma.product.count({
      where: { productFamilyId: familyId, status: { in: ['APPROVED', 'ACTIVE'] } }
    });
  }

  // ==========================================
  // Product Operations
  // ==========================================
  async findProductById(id: string): Promise<(Product & { variants: ProductVariant[]; category: Category; uom: unknown }) | null> {
    return this.prisma.product.findUnique({
      where: { id },
      include: { variants: true, category: true, uom: true, productFamily: true }
    });
  }

  async findProductBySku(sku: string): Promise<Product | null> {
    return this.prisma.product.findUnique({ where: { sku } });
  }

  async findInventoryNameConflict(
    name: string,
    current?: { entity: 'PRODUCT' | 'MATERIAL'; id: string }
  ): Promise<{ id: string; name: string } | null> {
    const [products, material] = await Promise.all([
      this.prisma.product.findMany({
        where: {
          name: { equals: name, mode: 'insensitive' },
          status: { notIn: ['INACTIVE', 'SUPERSEDED'] },
          ...(current?.entity === 'PRODUCT' ? { id: { not: current.id } } : {}),
        },
        select: { id: true, name: true, metadata: true },
      }),
      this.prisma.material.findFirst({
        where: {
          name: { equals: name, mode: 'insensitive' },
          // Variant names are scoped to their parent material, not the global catalog.
          NOT: { specs: { path: ['isVariant'], equals: true } },
          ...(current?.entity === 'MATERIAL' ? { id: { not: current.id } } : {}),
        },
        select: { id: true, name: true },
      }),
    ]);
    // Variant records belong to their parent catalog item and should not
    // block a new top-level product with the same name. Filter after querying
    // so products with null metadata remain valid uniqueness candidates.
    const product = products.find((candidate) =>
      (candidate.metadata as any)?.isVariant !== true &&
      !(candidate.metadata as any)?.parentProductId
    ) || null;
    return product || material;
  }

  async listProducts(params?: {
    categoryId?: string;
    productFamilyId?: string;
    status?: LifecycleStatus;
    search?: string;
    skip?: number;
    take?: number;
  }): Promise<{ items: Product[]; total: number }> {
    const where: Prisma.ProductWhereInput = {};
    if (params?.categoryId) where.categoryId = params.categoryId;
    if (params?.productFamilyId) where.productFamilyId = params.productFamilyId;
    if (params?.status && typeof params.status === 'string') {
      where.status = params.status as LifecycleStatus;
    }
    if (params?.search) {
      where.OR = [
        { sku: { contains: params.search, mode: 'insensitive' } },
        { name: { contains: params.search, mode: 'insensitive' } }
      ];
    }
    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip: params?.skip,
        take: params?.take,
        include: { category: true, uom: true, productFamily: true, variants: true },
        orderBy: { createdAt: 'desc' }
      }),
      this.prisma.product.count({ where })
    ]);
    return { items, total };
  }

  async createProduct(data: Prisma.ProductCreateInput): Promise<Product> {
    return this.prisma.product.create({ data });
  }

  async updateProduct(id: string, data: Prisma.ProductUpdateInput): Promise<Product> {
    return this.prisma.product.update({ where: { id }, data });
  }

  async supersedeProduct(oldId: string, newProductData: Prisma.ProductCreateInput): Promise<{ oldProduct: Product; newProduct: Product }> {
    return this.prisma.$transaction(async (tx) => {
      const newProduct = await tx.product.create({ data: newProductData });
      const oldProduct = await tx.product.update({
        where: { id: oldId },
        data: {
          status: 'SUPERSEDED',
          supersededById: newProduct.id,
          deactivatedAt: new Date()
        }
      });
      return { oldProduct, newProduct };
    });
  }

  async countProductActiveReferences(productId: string): Promise<{
    variants: number;
    routes: number;
  }> {
    const [variants, routes] = await Promise.all([
      this.prisma.productVariant.count({
        where: { productId, status: { in: ['APPROVED', 'ACTIVE'] } }
      }),
      this.prisma.productRoute.count({
        where: { productId, status: { in: ['APPROVED', 'ACTIVE'] } }
      })
    ]);
    return { variants, routes };
  }

  // ==========================================
  // ProductVariant Operations
  // ==========================================
  async findVariantById(id: string): Promise<ProductVariant | null> {
    return this.prisma.productVariant.findUnique({ where: { id }, include: { product: true } });
  }

  async findVariantBySku(sku: string): Promise<ProductVariant | null> {
    return this.prisma.productVariant.findUnique({ where: { sku } });
  }

  async listVariants(params?: {
    productId?: string;
    status?: LifecycleStatus;
    search?: string;
    skip?: number;
    take?: number;
  }): Promise<{ items: ProductVariant[]; total: number }> {
    const where: Prisma.ProductVariantWhereInput = {};
    if (params?.productId) where.productId = params.productId;
    if (params?.status) where.status = params.status;
    if (params?.search) {
      where.OR = [
        { sku: { contains: params.search, mode: 'insensitive' } },
        { name: { contains: params.search, mode: 'insensitive' } }
      ];
    }
    const [items, total] = await Promise.all([
      this.prisma.productVariant.findMany({
        where,
        skip: params?.skip,
        take: params?.take,
        include: { product: true },
        orderBy: { createdAt: 'desc' }
      }),
      this.prisma.productVariant.count({ where })
    ]);
    return { items, total };
  }

  async createVariant(data: Prisma.ProductVariantCreateInput): Promise<ProductVariant> {
    return this.prisma.productVariant.create({ data });
  }

  async updateVariant(id: string, data: Prisma.ProductVariantUpdateInput): Promise<ProductVariant> {
    return this.prisma.productVariant.update({ where: { id }, data });
  }

  async supersedeVariant(oldId: string, newVariantData: Prisma.ProductVariantCreateInput): Promise<{ oldVariant: ProductVariant; newVariant: ProductVariant }> {
    return this.prisma.$transaction(async (tx) => {
      const newVariant = await tx.productVariant.create({ data: newVariantData });
      const oldVariant = await tx.productVariant.update({
        where: { id: oldId },
        data: {
          status: 'SUPERSEDED',
          supersededById: newVariant.id,
          deactivatedAt: new Date()
        }
      });
      return { oldVariant, newVariant };
    });
  }
}
