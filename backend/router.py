from fastapi import APIRouter, Depends

from auth.oauth import router as auth_router
from auth.jwt import router as jwt_router
from auth.me import router as me_router
from pdf.compress import router as compress_router
from pdf.merge import router as merge_router
from pdf.rearrange import router as rearrange_router
from pdf.remove_pages import router as remove_pages_router
from pdf.convert import router as convert_router
from pdf.edit_overlay import router as edit_overlay_router
from pdf.split import router as split_router
from pdf.security import router as security_router
from pdf.scrub import router as scrub_router
from pdf.watermark import router as watermark_router
from pdf.img2pdf import router as img2pdf_router
from pdf.to_word import router as to_word_router
from pdf.ocr import router as ocr_router
from pdf.compare import router as compare_router
from admin.router import router as admin_router
from middleware.origin import router as health_router
from middleware.quota import enforce_quota

api_router = APIRouter()

api_router.include_router(health_router, tags=["system"])
api_router.include_router(auth_router, prefix="/auth", tags=["auth"])
api_router.include_router(me_router, prefix="/auth", tags=["auth"])
api_router.include_router(jwt_router, prefix="/auth", tags=["auth"])
api_router.include_router(compress_router, prefix="/pdf", tags=["pdf"], dependencies=[Depends(enforce_quota)])
api_router.include_router(merge_router, prefix="/pdf", tags=["pdf"], dependencies=[Depends(enforce_quota)])
api_router.include_router(rearrange_router, prefix="/pdf", tags=["pdf"], dependencies=[Depends(enforce_quota)])
api_router.include_router(remove_pages_router, prefix="/pdf", tags=["pdf"], dependencies=[Depends(enforce_quota)])
api_router.include_router(convert_router, prefix="/pdf", tags=["pdf"], dependencies=[Depends(enforce_quota)])
api_router.include_router(edit_overlay_router, prefix="/pdf", tags=["pdf"], dependencies=[Depends(enforce_quota)])
api_router.include_router(split_router, prefix="/pdf", tags=["pdf"], dependencies=[Depends(enforce_quota)])
api_router.include_router(security_router, prefix="/pdf", tags=["pdf"], dependencies=[Depends(enforce_quota)])
api_router.include_router(scrub_router, prefix="/pdf", tags=["pdf"], dependencies=[Depends(enforce_quota)])
api_router.include_router(watermark_router, prefix="/pdf", tags=["pdf"], dependencies=[Depends(enforce_quota)])
api_router.include_router(img2pdf_router, prefix="/pdf", tags=["pdf"], dependencies=[Depends(enforce_quota)])
api_router.include_router(to_word_router, prefix="/pdf", tags=["pdf"], dependencies=[Depends(enforce_quota)])
api_router.include_router(ocr_router, prefix="/pdf", tags=["pdf"], dependencies=[Depends(enforce_quota)])
api_router.include_router(compare_router, prefix="/pdf", tags=["pdf"], dependencies=[Depends(enforce_quota)])
api_router.include_router(admin_router, prefix="/admin", tags=["admin"])
